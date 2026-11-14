import { Article, Song, ElementConfig, RankConfig, DiscordWebhooksConfig, Comment } from '../types';
import { buildDefaultElements } from '../constants/elements';
import { DEFAULT_GOOGLE_SHEET_URL, SHEET_SONGS } from '../constants/sheetSongs';
import { getCachedLiveSheetSongs, mergeSongsWithSheetData } from './googleSheetsService';
import { safeJson } from '../utils/safeJson';
import { auth } from '../lib/firebase';
import {
  getFirebaseIdToken,
  fetchPostsFromFirestore,
  fetchPostByIdFromFirestore,
  createPostInFirestore,
  updatePostInFirestore,
  deletePostInFirestore,
  addCommentInFirestore,
  deleteCommentInFirestore,
  fetchSongsFromFirestore,
  saveSongInFirestore,
  deleteSongInFirestore,
  fetchElementsFromFirestore,
  saveElementsInFirestore,
  fetchRanksFromFirestore,
  saveRanksInFirestore,
  fetchDiscordWebhooksFromFirestore,
  saveDiscordWebhooksInFirestore,
} from './firestoreService';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('robeats_token') || localStorage.getItem('robeats_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getAuthHeadersWithFirebase(): Promise<Record<string, string>> {
  const base = getAuthHeader();
  const fbToken = await getFirebaseIdToken();
  return fbToken ? { ...base, 'X-Firebase-Token': fbToken } : base;
}

export async function fetchNewsArticles(): Promise<Article[]> {
  try {
    const fsPosts = await fetchPostsFromFirestore();
    if (fsPosts.length > 0) return fsPosts;
  } catch (err) {
    console.warn('Firestore fetchPosts fallback:', err);
  }
  const res = await fetch('/api/news');
  if (!res.ok) throw new Error('Failed to fetch articles');
  return safeJson(res, []);
}

export async function fetchArticleById(id: string): Promise<Article> {
  try {
    const fsPost = await fetchPostByIdFromFirestore(id);
    if (fsPost) return fsPost;
  } catch (err) {
    console.warn('Firestore fetchArticleById fallback:', err);
  }
  const res = await fetch(`/api/news/${id}`);
  if (!res.ok) throw new Error('Failed to fetch article');
  return safeJson(res, null as any);
}

export async function saveArticle(article: Partial<Article>, id?: string): Promise<Article> {
  if (auth.currentUser) {
    if (id) {
      await updatePostInFirestore(id, article);
      return {
        ...(article as Article),
        id,
        updatedAt: new Date().toISOString(),
      };
    }
    const newId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return await createPostInFirestore({
      ...(article as Article),
      id: newId,
      publishedAt: article.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: article.status || 'published',
      views: article.views ?? 1,
    });
  }

  const url = id ? `/api/news/${id}` : '/api/news';
  const method = id ? 'PUT' : 'POST';
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(article),
  });
  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to save article');
  }
  return safeJson(res, null as any);
}

export async function deleteArticle(id: string): Promise<void> {
  if (auth.currentUser) {
    await deletePostInFirestore(id);
    return;
  }
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch(`/api/news/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete article');
}

export async function publishToDiscord(id: string): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeadersWithFirebase();
  let postPayload: Article | null = null;
  let webhookUrl = '';

  try {
    postPayload = await fetchPostByIdFromFirestore(id);
  } catch {
    // Ignore and let endpoint resolve
  }

  if (auth.currentUser) {
    try {
      const hooks = await fetchDiscordWebhooksFromFirestore();
      const cat = postPayload?.category as keyof DiscordWebhooksConfig | undefined;
      if (cat && hooks[cat]) {
        const entry = hooks[cat];
        webhookUrl = typeof entry === 'string' ? entry : entry?.url || '';
      }
    } catch {
      // Ignore
    }
  }

  const res = await fetch(`/api/news/${id}/publish-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      ...(postPayload || {}),
      ...(webhookUrl ? { webhookUrl } : {}),
    }),
  });
  const data = await safeJson(res, {});
  if (!res.ok) throw new Error(data?.error || 'Failed to trigger Discord webhook');
  return data;
}

export async function addComment(postId: string, content: string): Promise<Comment> {
  if (auth.currentUser) {
    const displayName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Player';
    return await addCommentInFirestore(
      postId,
      content,
      displayName,
      auth.currentUser.photoURL || ''
    );
  }

  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch(`/api/news/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to post comment');
  }
  return safeJson(res, null as any);
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  if (auth.currentUser) {
    await deleteCommentInFirestore(postId, commentId);
    return;
  }

  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch(`/api/news/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete comment');
}

export async function fetchSongsList(forceRefreshSheet: boolean = false): Promise<Song[]> {
  let baseSongs: Song[] = [];

  try {
    const fsSongs = await fetchSongsFromFirestore();
    if (fsSongs.length > 0) baseSongs = fsSongs;
  } catch (err) {
    console.warn('Firestore fetchSongs fallback:', err);
  }

  if (baseSongs.length === 0) {
    try {
      const res = await fetch('/api/songs');
      if (res.ok) {
        const apiSongs = await safeJson<Song[]>(res, []);
        if (Array.isArray(apiSongs) && apiSongs.length > 0) baseSongs = apiSongs;
      }
    } catch (err) {
      console.warn('API fetchSongs fallback:', err);
    }
  }

  if (baseSongs.length === 0) {
    baseSongs = SHEET_SONGS;
  }

  try {
    const liveSheetSongs = await getCachedLiveSheetSongs(DEFAULT_GOOGLE_SHEET_URL, forceRefreshSheet);
    if (liveSheetSongs.length > 0) {
      return mergeSongsWithSheetData(baseSongs, liveSheetSongs, {
        appendMissing: true,
        strictSheetCover: false,
      });
    }
  } catch (err) {
    console.warn('Live Google Sheet cover art merge skipped:', err);
  }

  return baseSongs;
}

export async function saveSong(song: Partial<Song>, id?: string): Promise<Song> {
  if (auth.currentUser) {
    return await saveSongInFirestore(song, id);
  }
  const url = id ? `/api/songs/${id}` : '/api/songs';
  const method = id ? 'PUT' : 'POST';
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(song),
  });
  if (!res.ok) throw new Error('Failed to save song');
  return safeJson(res, null as any);
}

export async function deleteSong(id: string): Promise<void> {
  if (auth.currentUser) {
    await deleteSongInFirestore(id);
    return;
  }
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch(`/api/songs/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete song');
}

export async function fetchElementsList(): Promise<ElementConfig[]> {
  try {
    const fsElements = await fetchElementsFromFirestore();
    if (fsElements.length > 0) return fsElements;
  } catch (err) {
    console.warn('Firestore fetchElements fallback:', err);
  }
  try {
    const res = await fetch('/api/elements');
    if (res.ok) {
      const data = await safeJson(res, []);
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // fallback below
  }
  return buildDefaultElements();
}

export async function updateElementsList(elements: ElementConfig[]): Promise<void> {
  if (auth.currentUser) {
    await saveElementsInFirestore(elements);
    return;
  }
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch('/api/elements', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(elements),
  });
  if (!res.ok) throw new Error('Failed to update elements');
}

export async function fetchRanksList(): Promise<RankConfig[]> {
  try {
    return await fetchRanksFromFirestore();
  } catch (err) {
    console.warn('Firestore fetchRanks fallback:', err);
  }
  const res = await fetch('/api/ranks');
  if (!res.ok) throw new Error('Failed to fetch ranks');
  return safeJson(res, []);
}

export async function updateRanksList(ranks: RankConfig[]): Promise<void> {
  if (auth.currentUser) {
    await saveRanksInFirestore(ranks);
    return;
  }
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch('/api/admin/ranks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(ranks),
  });
  if (!res.ok) throw new Error('Failed to update ranks');
}

export async function fetchDiscordWebhooks(): Promise<DiscordWebhooksConfig> {
  if (auth.currentUser) {
    return await fetchDiscordWebhooksFromFirestore();
  }
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch('/api/admin/webhooks', {
    headers,
  });
  if (!res.ok) throw new Error('Failed to fetch webhooks');
  return safeJson(res, {} as any);
}

export async function updateDiscordWebhooks(config: DiscordWebhooksConfig): Promise<void> {
  if (auth.currentUser) {
    await saveDiscordWebhooksInFirestore(config);
    return;
  }
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch('/api/admin/webhooks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to update webhooks');
}

export async function generateAiImage(prompt: string, aspectRatio = '16:9'): Promise<{ imageUrl: string }> {
  const headers = await getAuthHeadersWithFirebase();
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ prompt, aspectRatio }),
  });
  if (!res.ok) throw new Error('Failed to generate image');
  return safeJson(res, { imageUrl: '' });
}
