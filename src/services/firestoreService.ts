import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import {
  NewsArticle,
  SongEntry,
  User,
  UserPermissions,
  UserRole,
  Comment,
  ElementConfig,
  RankConfig,
  DifficultyFramesConfig,
  DEFAULT_DIFFICULTY_FRAMES,
  DEFAULT_ROBEATS_RANKS,
  DiscordWebhooksConfig,
} from '../types';
import { normalizeElementName } from '../constants/elements';
import {
  buildCatalogLookup,
  mergePostSongWithCatalog,
  dispatchSongsUpdatedEvent,
} from '../utils/songSync';

export const BOOTSTRAP_ADMIN_EMAIL = 'chautuan9461@gmail.com';
export const BOOTSTRAP_ADMIN_EMAILS = [
  'chautuan9461@gmail.com',
  'anh6052018@gmail.com',
];

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || `doc_${Date.now()}`;
}

/**
 * Recursively remove `undefined` values so Firestore setDoc/updateDoc never crashes
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    // Preserve Firestore FieldValue sentinels (e.g. serverTimestamp())
    if (typeof (value as any)._methodName === 'string' || typeof (value as any).toDate === 'function') {
      return value;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export async function getFirebaseIdToken(): Promise<string | null> {
  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('Could not get Firebase ID token', err);
  }
  return null;
}

function normalizeTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function mapDocToArticle(docId: string, data: any): NewsArticle {
  return {
    id: String(data.id || docId),
    title: String(data.title || 'Untitled'),
    subtitle: data.subtitle || '',
    content: data.content || '',
    summary: data.summary || '',
    category: data.category || 'Daily mission',
    author:
      data.author && typeof data.author === 'object'
        ? data.author
        : { name: 'Staff', role: 'Staff', avatar: '' },
    publishedAt: normalizeTimestamp(data.publishedAt || data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt || data.createdAt),
    readTime: data.readTime || '1 min read',
    coverImage: data.coverImage || undefined,
    coverImageCaption: data.coverImageCaption || '',
    isBreaking: Boolean(data.isBreaking),
    isFeatured: Boolean(data.isFeatured),
    isTrending: Boolean(data.isTrending),
    missionRank: data.missionRank || undefined,
    status: data.status || 'published',
    tags: Array.isArray(data.tags) ? data.tags : [],
    views: typeof data.views === 'number' ? data.views : 1,
    songs: Array.isArray(data.songs) ? data.songs : [],
    reactions: data.reactions && typeof data.reactions === 'object' ? data.reactions : {},
    comments: Array.isArray(data.comments) ? data.comments : [],
    authorUid: data.authorUid,
  };
}

function buildSafePostPayload(
  article: Partial<NewsArticle>,
  postId: string,
  authorUid: string,
  isCreate: boolean
) {
  const safeTags = Array.isArray(article.tags)
    ? article.tags.filter((t): t is string => typeof t === 'string' && t.length > 0).slice(0, 15)
    : undefined;
  const safeSongs = Array.isArray(article.songs)
    ? stripUndefinedDeep(article.songs.slice(0, 20))
    : undefined;

  const base: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (article.title !== undefined || isCreate) {
    const cleanTitle = String(article.title || 'RoBeats News').trim().slice(0, 200);
    base.title = cleanTitle || 'RoBeats News';
  }
  if (article.category !== undefined || isCreate) {
    const cleanCat = String(article.category || 'Daily mission').trim().slice(0, 64);
    base.category = cleanCat || 'Daily mission';
  }
  if (article.status !== undefined || isCreate) {
    base.status = article.status === 'draft' ? 'draft' : 'published';
  }
  if (article.subtitle !== undefined) base.subtitle = String(article.subtitle).slice(0, 300);
  if (article.content !== undefined) base.content = String(article.content).slice(0, 20000);
  if (article.summary !== undefined) base.summary = String(article.summary).slice(0, 500);
  if (article.author !== undefined && typeof article.author === 'object') {
    base.author = stripUndefinedDeep(article.author);
  }
  if (article.publishedAt !== undefined) base.publishedAt = String(article.publishedAt).slice(0, 64);
  if (article.readTime !== undefined) base.readTime = String(article.readTime).slice(0, 32);
  if (article.coverImage !== undefined) {
    base.coverImage = String(article.coverImage || '').slice(0, 2048);
  }
  if (article.coverImageCaption !== undefined) {
    base.coverImageCaption = String(article.coverImageCaption).slice(0, 300);
  }
  if (article.isBreaking !== undefined) base.isBreaking = Boolean(article.isBreaking);
  if (article.isFeatured !== undefined) base.isFeatured = Boolean(article.isFeatured);
  if (article.isTrending !== undefined) base.isTrending = Boolean(article.isTrending);
  if (article.missionRank !== undefined) {
    base.missionRank = String(article.missionRank || '').slice(0, 32);
  }
  if (article.views !== undefined) base.views = Math.max(0, Number(article.views) || 0);
  if (safeTags !== undefined) base.tags = safeTags;
  if (safeSongs !== undefined) base.songs = safeSongs;
  if (article.reactions !== undefined && typeof article.reactions === 'object') {
    base.reactions = stripUndefinedDeep(article.reactions);
  }

  if (isCreate) {
    base.id = postId;
    base.authorUid = authorUid;
    base.createdAt = serverTimestamp();
    if (!base.publishedAt) base.publishedAt = new Date().toISOString();
    if (!base.reactions) base.reactions = {};
  }

  return stripUndefinedDeep(base);
}

// ====================================================
// POSTS & COMMENTS
// ====================================================

export async function fetchPostsFromFirestore(): Promise<NewsArticle[]> {
  const path = 'posts';
  try {
    const q = query(collection(db, path), where('status', '==', 'published'));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => mapDocToArticle(d.id, d.data()));
    items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchPostByIdFromFirestore(postId: string): Promise<NewsArticle | null> {
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;
  try {
    const snap = await getDoc(doc(db, 'posts', safeId));
    if (!snap.exists()) return null;
    return mapDocToArticle(snap.id, snap.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeToPublishedPosts(
  onData: (posts: NewsArticle[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = 'posts';
  const q = query(collection(db, path), where('status', '==', 'published'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapDocToArticle(d.id, d.data()));
      items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped: any) {
        if (onError) onError(wrapped);
      }
    }
  );
}

export async function createPostInFirestore(article: NewsArticle): Promise<NewsArticle> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Firebase Google authentication required to create posts.');
  }
  const postId = sanitizeFirestoreId(
    article.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const path = `posts/${postId}`;
  const authorUid = sanitizeFirestoreId(currentUser.uid);
  const payload = buildSafePostPayload(article, postId, authorUid, true);

  try {
    await setDoc(doc(db, 'posts', postId), payload);
    return {
      ...article,
      id: postId,
      authorUid,
      publishedAt: payload.publishedAt,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updatePostInFirestore(
  postId: string,
  updates: Partial<NewsArticle>
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Firebase Google authentication required to update posts.');
  }
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;
  const docRef = doc(db, 'posts', safeId);
  const authorUid = sanitizeFirestoreId(currentUser.uid);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const payload = buildSafePostPayload(updates, safeId, authorUid, false);
      await updateDoc(docRef, payload);
    } else {
      const payload = buildSafePostPayload(
        {
          status: 'published',
          views: 1,
          reactions: {},
          ...updates,
        },
        safeId,
        authorUid,
        true
      );
      await setDoc(docRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePostInFirestore(postId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Firebase Google authentication required to delete posts.');
  }
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;

  try {
    await deleteDoc(doc(db, 'posts', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function togglePostReactionInFirestore(
  postId: string,
  reactions: Record<string, number>
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;
  const docRef = doc(db, 'posts', safeId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    await updateDoc(docRef, {
      reactions: stripUndefinedDeep(reactions),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchCommentsFromFirestore(postId: string): Promise<Comment[]> {
  const safePostId = sanitizeFirestoreId(postId);
  const path = `posts/${safePostId}/comments`;
  try {
    const q = query(collection(db, 'posts', safePostId, 'comments'), where('postId', '==', safePostId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        postId: String(data.postId || safePostId),
        userId: data.authorUid,
        authorName: String(data.authorName || 'Player'),
        authorAvatar: data.authorAvatar || '',
        authorRole: data.authorRole || 'player',
        content: String(data.content || ''),
        createdAt: normalizeTimestamp(data.createdAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function addCommentInFirestore(
  postId: string,
  content: string,
  authorName: string,
  authorAvatar?: string,
  authorRole?: string
): Promise<Comment> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sign in with Google to post comments.');
  }
  const safePostId = sanitizeFirestoreId(postId);
  const commentId = sanitizeFirestoreId(
    `comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const path = `posts/${safePostId}/comments/${commentId}`;
  const authorUid = sanitizeFirestoreId(currentUser.uid);

  try {
    await setDoc(doc(db, 'posts', safePostId, 'comments', commentId), {
      id: commentId,
      postId: safePostId,
      authorUid,
      authorName: String(authorName || currentUser.displayName || 'Player').slice(0, 80),
      authorAvatar: String(authorAvatar || currentUser.photoURL || '').slice(0, 2048),
      authorRole: String(authorRole || 'player').slice(0, 32),
      content: String(content).trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    return {
      id: commentId,
      postId: safePostId,
      userId: authorUid,
      authorName: String(authorName || currentUser.displayName || 'Player'),
      authorAvatar: authorAvatar || currentUser.photoURL || '',
      authorRole: authorRole || 'player',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteCommentInFirestore(postId: string, commentId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const safePostId = sanitizeFirestoreId(postId);
  const safeCommentId = sanitizeFirestoreId(commentId);
  const path = `posts/${safePostId}/comments/${safeCommentId}`;

  try {
    await deleteDoc(doc(db, 'posts', safePostId, 'comments', safeCommentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ====================================================
// SONGS CATALOG
// ====================================================

export async function fetchSongsFromFirestore(): Promise<SongEntry[]> {
  const path = 'songs';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        ...data,
        id: String(data.id || d.id),
        element: normalizeElementName(data.element),
      } as SongEntry;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function propagateSongUpdatesToPostsInFirestore(
  updatedSongs: SongEntry[]
): Promise<number> {
  if (!auth.currentUser || !Array.isArray(updatedSongs) || updatedSongs.length === 0) {
    return 0;
  }

  try {
    const lookup = buildCatalogLookup(updatedSongs);
    const snap = await getDocs(collection(db, 'posts'));
    const pendingUpdates: Array<{ ref: any; songs: SongEntry[] }> = [];

    for (const d of snap.docs) {
      const data = d.data() || {};
      const currentSongs = Array.isArray(data.songs) ? (data.songs as SongEntry[]) : [];
      if (currentSongs.length === 0) continue;

      let changed = false;
      const nextSongs = currentSongs.slice(0, 20).map((ps) => {
        const merged = mergePostSongWithCatalog(ps, lookup);
        if (JSON.stringify(merged) !== JSON.stringify(ps)) {
          changed = true;
        }
        return stripUndefinedDeep(merged);
      });

      if (changed) {
        pendingUpdates.push({ ref: d.ref, songs: nextSongs });
      }
    }

    if (pendingUpdates.length === 0) return 0;

    const CHUNK_SIZE = 350;
    for (let i = 0; i < pendingUpdates.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const item of pendingUpdates.slice(i, i + CHUNK_SIZE)) {
        batch.update(item.ref, {
          songs: item.songs,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return pendingUpdates.length;
  } catch (err) {
    console.warn('Could not propagate song edits to Firestore posts:', err);
    return 0;
  }
}

export async function saveSongInFirestore(
  song: Partial<SongEntry>,
  existingId?: string
): Promise<SongEntry> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to save songs.');
  }

  const songId = sanitizeFirestoreId(
    existingId || song.id || `song_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const path = `songs/${songId}`;
  const songRef = doc(db, 'songs', songId);

  try {
    const snap = await getDoc(songRef);
    if (snap.exists()) {
      const existingData = snap.data() || {};
      const updatePayload: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };
      if (song.title !== undefined) updatePayload.title = String(song.title || '').trim().slice(0, 200) || 'Untitled Song';
      if (song.artist !== undefined) updatePayload.artist = String(song.artist || '').trim().slice(0, 200) || 'Unknown Artist';
      if (song.mapper !== undefined) updatePayload.mapper = String(song.mapper || 'Official RoBeats').trim().slice(0, 120);
      if (song.coverArt !== undefined) updatePayload.coverArt = String(song.coverArt || '').trim().slice(0, 2048);
      if (song.coverArtEasy !== undefined) updatePayload.coverArtEasy = String(song.coverArtEasy || '').trim().slice(0, 2048);
      if (song.coverArtNormal !== undefined) updatePayload.coverArtNormal = String(song.coverArtNormal || '').trim().slice(0, 2048);
      if (song.coverArtHard !== undefined) updatePayload.coverArtHard = String(song.coverArtHard || '').trim().slice(0, 2048);
      if (song.difficulty !== undefined) {
        updatePayload.difficulty = {
          easy: String(song.difficulty?.easy ?? existingData.difficulty?.easy ?? '-').slice(0, 16),
          normal: String(song.difficulty?.normal ?? existingData.difficulty?.normal ?? '-').slice(0, 16),
          hard: String(song.difficulty?.hard ?? existingData.difficulty?.hard ?? '-').slice(0, 16),
        };
      }
      if (song.element !== undefined) updatePayload.element = normalizeElementName(song.element).slice(0, 64);
      if (song.duration !== undefined) updatePayload.duration = String(song.duration || '').slice(0, 32);
      if (song.bpm !== undefined) updatePayload.bpm = String(song.bpm || '').slice(0, 32);
      if (song.dateAdded !== undefined) updatePayload.dateAdded = String(song.dateAdded || '').slice(0, 64);
      if (song.isCustom !== undefined) updatePayload.isCustom = Boolean(song.isCustom);

      await updateDoc(songRef, stripUndefinedDeep(updatePayload));
      const savedSong = {
        ...existingData,
        ...updatePayload,
        id: songId,
        element: normalizeElementName(
          updatePayload.element !== undefined ? updatePayload.element : existingData.element
        ),
        updatedAt: new Date().toISOString(),
      } as unknown as SongEntry;
      dispatchSongsUpdatedEvent({ updatedSongs: [savedSong] });
      await propagateSongUpdatesToPostsInFirestore([savedSong]);
      return savedSong;
    }

    const primaryCover = String(
      song.coverArt || song.coverArtNormal || song.coverArtEasy || song.coverArtHard || ''
    )
      .trim()
      .slice(0, 2048);

    const safeDiff = {
      easy: String(song.difficulty?.easy ?? '-').slice(0, 16),
      normal: String(song.difficulty?.normal ?? '-').slice(0, 16),
      hard: String(song.difficulty?.hard ?? '-').slice(0, 16),
    };

    const createPayload: Record<string, any> = stripUndefinedDeep({
      id: songId,
      title: String(song.title || '').trim().slice(0, 200) || 'Untitled Song',
      artist: String(song.artist || '').trim().slice(0, 200) || 'Unknown Artist',
      mapper: String(song.mapper || 'Official RoBeats').trim().slice(0, 120),
      coverArt: primaryCover,
      coverArtEasy: String(song.coverArtEasy || primaryCover).slice(0, 2048),
      coverArtNormal: String(song.coverArtNormal || primaryCover).slice(0, 2048),
      coverArtHard: String(song.coverArtHard || primaryCover).slice(0, 2048),
      difficulty: safeDiff,
      element: normalizeElementName(song.element).slice(0, 64),
      duration: String(song.duration || '').slice(0, 32),
      bpm: String(song.bpm || '').slice(0, 32),
      dateAdded: String(song.dateAdded || new Date().toLocaleDateString('en-US')).slice(0, 64),
      isCustom: Boolean(song.isCustom ?? true),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(songRef, createPayload);
    const createdSong = {
      ...createPayload,
      id: songId,
      updatedAt: new Date().toISOString(),
    } as unknown as SongEntry;
    dispatchSongsUpdatedEvent({ updatedSongs: [createdSong] });
    await propagateSongUpdatesToPostsInFirestore([createdSong]);
    return createdSong;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSongInFirestore(songId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to delete songs.');
  }
  const safeId = sanitizeFirestoreId(songId);
  const path = `songs/${safeId}`;

  try {
    await deleteDoc(doc(db, 'songs', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncSongsBatchInFirestore(
  sheetSongs: Partial<SongEntry>[],
  options?: {
    preserveExistingMedia?: boolean;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<{ created: number; updated: number; total: number }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to sync songs to Firestore.');
  }

  const preserveMedia = options?.preserveExistingMedia !== false;
  const existingById = new Map<string, Record<string, any>>();
  const existingIdByKey = new Map<string, string>();

  try {
    const snap = await getDocs(collection(db, 'songs'));
    for (const d of snap.docs) {
      const data = d.data() || {};
      existingById.set(d.id, data);
      const key = `${String(data.title || '').toLowerCase().trim()}::${String(data.artist || '').toLowerCase().trim()}`;
      if (key !== '::' && !existingIdByKey.has(key)) {
        existingIdByKey.set(key, d.id);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'songs');
  }

  let created = 0;
  let updated = 0;
  const CHUNK_SIZE = 400;
  const total = sheetSongs.length;
  const syncedSongs: SongEntry[] = [];

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = sheetSongs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const rawSong of chunk) {
      const cleanTitle = String(rawSong.title || '').trim().slice(0, 200) || 'Untitled Song';
      const cleanArtist = String(rawSong.artist || '').trim().slice(0, 200) || 'Unknown Artist';
      const matchKey = `${cleanTitle.toLowerCase()}::${cleanArtist.toLowerCase()}`;
      const matchedExistingId = existingIdByKey.get(matchKey);
      const songId = sanitizeFirestoreId(
        matchedExistingId || rawSong.id || `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      );
      const songRef = doc(db, 'songs', songId);
      const existingData = existingById.get(songId);

      const safeDiff = {
        easy: String(rawSong.difficulty?.easy ?? '-').slice(0, 16) || '-',
        normal: String(rawSong.difficulty?.normal ?? '-').slice(0, 16) || '-',
        hard: String(rawSong.difficulty?.hard ?? '-').slice(0, 16) || '-',
      };

      const incomingCover = String(
        rawSong.coverArt || rawSong.coverArtNormal || rawSong.coverArtEasy || rawSong.coverArtHard || ''
      )
        .trim()
        .slice(0, 2048);

      const incomingElement = normalizeElementName(rawSong.element).slice(0, 64);

      if (existingData) {
        const updatePayload: Record<string, any> = {
          title: cleanTitle,
          artist: cleanArtist,
          difficulty: safeDiff,
          updatedAt: serverTimestamp(),
        };

        if (incomingCover || !preserveMedia) {
          updatePayload.coverArt = incomingCover;
          updatePayload.coverArtEasy = incomingCover;
          updatePayload.coverArtNormal = incomingCover;
          updatePayload.coverArtHard = incomingCover;
        }

        const existingElement = normalizeElementName(existingData.element);
        if (incomingElement || !preserveMedia || existingElement !== String(existingData.element || '')) {
          updatePayload.element = incomingElement;
        }

        batch.update(songRef, stripUndefinedDeep(updatePayload));
        syncedSongs.push({
          ...existingData,
          ...updatePayload,
          id: songId,
          element: updatePayload.element !== undefined ? updatePayload.element : existingElement,
          updatedAt: new Date().toISOString(),
        } as unknown as SongEntry);
        updated++;
      } else {
        const createPayload: Record<string, any> = stripUndefinedDeep({
          id: songId,
          title: cleanTitle,
          artist: cleanArtist,
          mapper: String(rawSong.mapper || 'Official RoBeats').trim().slice(0, 120),
          coverArt: incomingCover,
          coverArtEasy: incomingCover,
          coverArtNormal: incomingCover,
          coverArtHard: incomingCover,
          difficulty: safeDiff,
          element: incomingElement,
          duration: String(rawSong.duration || '').slice(0, 32),
          bpm: String(rawSong.bpm || '').slice(0, 32),
          dateAdded: new Date().toLocaleDateString('en-US'),
          isCustom: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(songRef, createPayload);
        existingById.set(songId, createPayload);
        syncedSongs.push({
          ...createPayload,
          id: songId,
          updatedAt: new Date().toISOString(),
        } as unknown as SongEntry);
        created++;
      }
    }

    try {
      await batch.commit();
      if (options?.onProgress) {
        options.onProgress(Math.min(i + chunk.length, total), total);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'songs');
    }
  }

  dispatchSongsUpdatedEvent({ updatedSongs: syncedSongs, forceRefresh: true });
  await propagateSongUpdatesToPostsInFirestore(syncedSongs);

  return { created, updated, total };
}

// ====================================================
// ELEMENTS, RANKS, DIFFICULTY FRAMES, DISCORD WEBHOOKS
// ====================================================

export async function fetchElementsFromFirestore(): Promise<ElementConfig[]> {
  const path = 'elements';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        name: String(data.name || d.id),
        color: String(data.color || 'Cyan'),
        hexColor: data.hexColor || undefined,
        secondaryHexColor: data.secondaryHexColor || undefined,
        imageUrl: data.imageUrl || undefined,
      } as ElementConfig;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveElementsInFirestore(elements: ElementConfig[]): Promise<ElementConfig[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to update elements.');
  }

  for (const el of elements) {
    const elementId = sanitizeFirestoreId((el as any).id || el.name.toLowerCase());
    const path = `elements/${elementId}`;
    const elRef = doc(db, 'elements', elementId);
    const payload: Record<string, any> = stripUndefinedDeep({
      name: String(el.name || elementId).slice(0, 64),
      color: String(el.color || 'Cyan').slice(0, 64),
      ...(el.hexColor !== undefined ? { hexColor: String(el.hexColor || '').slice(0, 32) } : {}),
      ...(el.secondaryHexColor !== undefined
        ? { secondaryHexColor: String(el.secondaryHexColor || '').slice(0, 32) }
        : {}),
      ...(el.imageUrl !== undefined ? { imageUrl: String(el.imageUrl || '').slice(0, 2048) } : {}),
    });

    try {
      const snap = await getDoc(elRef);
      if (snap.exists()) {
        await updateDoc(elRef, payload);
      } else {
        await setDoc(elRef, { id: elementId, ...payload });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
  return elements;
}

export async function fetchRanksFromFirestore(): Promise<RankConfig[]> {
  const path = 'ranks';
  try {
    const snap = await getDocs(collection(db, path));
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        name: data.name,
        iconUrl: String(data.iconUrl || ''),
        color: String(data.color || '#64748B'),
        description: data.description || '',
      } as RankConfig;
    });
    if (list.length === 0) return DEFAULT_ROBEATS_RANKS;

    // Sort Star -> Pro -> Amateur -> Novice -> Beginner when matching defaults
    const order = ['star', 'pro', 'amateur', 'novice', 'beginner'];
    list.sort((a, b) => {
      const ia = order.indexOf(String(a.name).toLowerCase());
      const ib = order.indexOf(String(b.name).toLowerCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveRanksInFirestore(ranks: RankConfig[]): Promise<RankConfig[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to update ranks.');
  }

  const incomingIds = new Set<string>();
  try {
    const existingSnap = await getDocs(collection(db, 'ranks'));
    for (const rank of ranks) {
      const rankId = sanitizeFirestoreId(rank.id || rank.name.toLowerCase());
      incomingIds.add(rankId);
      const rankRef = doc(db, 'ranks', rankId);
      const payload = stripUndefinedDeep({
        name: String(rank.name || rankId).slice(0, 64),
        color: String(rank.color || '#64748B').slice(0, 32),
        iconUrl: String(rank.iconUrl || '').slice(0, 2048),
        description: String(rank.description || '').slice(0, 300),
      });

      const snap = await getDoc(rankRef);
      if (snap.exists()) {
        await updateDoc(rankRef, payload);
      } else {
        await setDoc(rankRef, { id: rankId, ...payload });
      }
    }

    // Delete ranks removed by admin
    for (const existingDoc of existingSnap.docs) {
      if (!incomingIds.has(existingDoc.id)) {
        await deleteDoc(doc(db, 'ranks', existingDoc.id));
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'ranks');
  }

  return ranks;
}

export async function fetchDifficultyFramesFromFirestore(): Promise<DifficultyFramesConfig> {
  const path = 'settings/frames';
  try {
    const snap = await getDoc(doc(db, 'settings', 'frames'));
    if (!snap.exists()) return DEFAULT_DIFFICULTY_FRAMES;
    const data = snap.data();
    return {
      easy: data.easy ?? DEFAULT_DIFFICULTY_FRAMES.easy,
      normal: data.normal ?? DEFAULT_DIFFICULTY_FRAMES.normal,
      hard: data.hard ?? DEFAULT_DIFFICULTY_FRAMES.hard,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveDifficultyFramesInFirestore(
  frames: DifficultyFramesConfig
): Promise<DifficultyFramesConfig> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to update difficulty frames.');
  }
  const path = 'settings/frames';
  const framesRef = doc(db, 'settings', 'frames');
  const payload = {
    easy: String(frames.easy ?? '').slice(0, 2048),
    normal: String(frames.normal ?? '').slice(0, 2048),
    hard: String(frames.hard ?? '').slice(0, 2048),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(framesRef);
    if (snap.exists()) {
      await updateDoc(framesRef, payload);
    } else {
      await setDoc(framesRef, { id: 'frames', ...payload });
    }
    return {
      easy: payload.easy,
      normal: payload.normal,
      hard: payload.hard,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchDiscordWebhooksFromFirestore(): Promise<DiscordWebhooksConfig> {
  const currentUser = auth.currentUser;
  if (!currentUser) return {};
  const path = 'webhooks/discord';
  try {
    const snap = await getDoc(doc(db, 'webhooks', 'discord'));
    if (!snap.exists()) {
      return {
        'Daily mission': '',
        'Weekly mission': '',
        'New song': '',
        'Updates': '',
      };
    }
    const data = snap.data();
    return {
      'Daily mission': data.dailyMission || '',
      'Weekly mission': data.weeklyMission || '',
      'New song': data.newSong || '',
      'Updates': data.updates || '',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveDiscordWebhooksInFirestore(
  config: DiscordWebhooksConfig
): Promise<DiscordWebhooksConfig> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Admin Google authentication required to save Discord webhooks.');
  }
  const path = 'webhooks/discord';
  const webhookRef = doc(db, 'webhooks', 'discord');
  const extractUrl = (val: any) =>
    (typeof val === 'string' ? val : val?.url || '').trim().slice(0, 512);

  const fieldsPayload = {
    dailyMission: extractUrl(config['Daily mission']),
    weeklyMission: extractUrl(config['Weekly mission']),
    newSong: extractUrl(config['New song']),
    updates: extractUrl(config['Updates']),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(webhookRef);
    if (snap.exists()) {
      await updateDoc(webhookRef, fieldsPayload);
    } else {
      await setDoc(webhookRef, { id: 'discord', ...fieldsPayload });
    }
    return {
      'Daily mission': fieldsPayload.dailyMission,
      'Weekly mission': fieldsPayload.weeklyMission,
      'New song': fieldsPayload.newSong,
      'Updates': fieldsPayload.updates,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ====================================================
// USERS, ROLES & STREAK REWARDS
// ====================================================

export async function resolveUserRoleFromFirestore(firebaseUser: FirebaseUser): Promise<UserRole> {
  const userEmail = firebaseUser.email?.toLowerCase() || '';
  if (BOOTSTRAP_ADMIN_EMAILS.includes(userEmail) && firebaseUser.emailVerified) {
    return 'admin';
  }
  try {
    const adminDoc = await getDoc(doc(db, 'admins', sanitizeFirestoreId(firebaseUser.uid)));
    if (adminDoc.exists()) {
      const role = adminDoc.data()?.role;
      if (role === 'admin' || role === 'staff') return role;
    }
  } catch (err) {
    console.warn('Could not read admin role document', err);
  }
  return 'player';
}

export function getPermissionsForRole(role: UserRole): UserPermissions {
  if (role === 'admin' || role === 'robeatsdev') {
    return {
      canManageUsers: true,
      canChangePasswords: true,
      canEditProfiles: true,
      canManageRoles: true,
      canPublishNews: true,
      canDeleteContent: true,
      canAccessAdminPanel: true,
      canEditAllNews: true,
      canManageSongs: true,
      canManageWebhooks: true,
      canManageRanks: true,
    };
  }
  if (role === 'staff' || role === 'editor') {
    return {
      canManageUsers: false,
      canChangePasswords: false,
      canEditProfiles: false,
      canManageRoles: false,
      canPublishNews: true,
      canDeleteContent: false,
      canAccessAdminPanel: false,
      canEditAllNews: true,
      canManageSongs: false,
      canManageWebhooks: false,
      canManageRanks: false,
    };
  }
  return {
    canManageUsers: false,
    canChangePasswords: false,
    canEditProfiles: false,
    canManageRoles: false,
    canPublishNews: false,
    canDeleteContent: false,
    canAccessAdminPanel: false,
    canEditAllNews: false,
    canManageSongs: false,
    canManageWebhooks: false,
    canManageRanks: false,
  };
}

export async function syncFirebaseUserDocs(firebaseUser: FirebaseUser): Promise<User> {
  const uid = sanitizeFirestoreId(firebaseUser.uid);
  const role = await resolveUserRoleFromFirestore(firebaseUser);
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  let existingPublic: any = null;
  let existingPrivate: any = null;
  try {
    const [snap, privSnap] = await Promise.all([getDoc(userRef), getDoc(privateRef)]);
    if (snap.exists()) existingPublic = snap.data();
    if (privSnap.exists()) existingPrivate = privSnap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const baseUsername =
    (
      existingPublic?.username ||
      firebaseUser.email?.split('@')[0] ||
      firebaseUser.displayName ||
      `player_${uid.slice(0, 6)}`
    )
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 64) || `player_${uid.slice(0, 6)}`;

  const displayName = (existingPublic?.displayName || firebaseUser.displayName || baseUsername).slice(
    0,
    80
  );
  const avatar = (
    existingPublic?.avatar ||
    firebaseUser.photoURL ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  ).slice(0, 2048);

  if (!existingPublic) {
    try {
      await setDoc(userRef, {
        id: uid,
        username: baseUsername,
        displayName,
        avatar,
        bio: role === 'admin' ? 'Administrator of RoBeats News' : 'RoBeats rhythm player',
        role: role === 'admin' ? 'admin' : 'player',
        currentStreak: 0,
        bestStreak: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }
  } else {
    try {
      const updatePayload: Record<string, any> = {
        displayName,
        avatar,
        updatedAt: serverTimestamp(),
      };
      if (role === 'admin' && existingPublic.role !== 'admin') {
        updatePayload.role = 'admin';
      }
      await updateDoc(userRef, updatePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  }

  // Write PII strictly into isolated private subcollection
  try {
    const emailStr = (firebaseUser.email || '').slice(0, 254);
    if (existingPrivate) {
      await updateDoc(privateRef, {
        email: emailStr,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(privateRef, {
        uid,
        email: emailStr,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
  }

  return {
    id: uid,
    username: baseUsername,
    email: firebaseUser.email || undefined,
    displayName,
    avatar,
    bio: existingPublic?.bio || (role === 'admin' ? 'Administrator of RoBeats News' : 'RoBeats rhythm player'),
    robloxUsername: existingPublic?.robloxUsername || '',
    roBeatsRank: existingPublic?.roBeatsRank || 'Beginner',
    preferredNoteSpeed: existingPublic?.preferredNoteSpeed || '1.8x',
    role,
    permissions: getPermissionsForRole(role),
    createdAt: normalizeTimestamp(existingPublic?.createdAt),
    currentStreak: existingPublic?.currentStreak ?? 0,
    bestStreak: existingPublic?.bestStreak ?? 0,
    lastCheckInDate: existingPrivate?.lastCheckInDate || '',
  };
}

function getGmt8DateString(offsetDays = 0): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const gmt8Date = new Date(utc - 8 * 3600000 + offsetDays * 86400000);
  const y = gmt8Date.getFullYear();
  const m = String(gmt8Date.getMonth() + 1).padStart(2, '0');
  const d = String(gmt8Date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function checkInStreakInFirestore(): Promise<{
  success: boolean;
  alreadyCheckedIn: boolean;
  message?: string;
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Google sign-in required for Login Streak check-in.');
  }

  const uid = sanitizeFirestoreId(currentUser.uid);
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  const today = getGmt8DateString(0);
  const yesterday = getGmt8DateString(-1);

  let pubData: any = {};
  let privData: any = {};
  try {
    const [pubSnap, privSnap] = await Promise.all([getDoc(userRef), getDoc(privateRef)]);
    if (pubSnap.exists()) pubData = pubSnap.data();
    if (privSnap.exists()) privData = privSnap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const lastCheckIn = String(privData?.lastCheckInDate || '');

  if (lastCheckIn === today) {
    return {
      success: false,
      alreadyCheckedIn: true,
      message: 'You have already checked in today! Come back tomorrow for the next streak day.',
      currentStreak: pubData?.currentStreak || 1,
      bestStreak: pubData?.bestStreak || 1,
      lastCheckInDate: today,
    };
  }

  const newStreak = lastCheckIn === yesterday ? (Number(pubData?.currentStreak) || 0) + 1 : 1;
  const bestStreak = Math.max(Number(pubData?.bestStreak) || 0, newStreak);

  try {
    await updateDoc(userRef, {
      currentStreak: newStreak,
      bestStreak,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  try {
    if (privData && privData.uid) {
      await updateDoc(privateRef, {
        lastCheckInDate: today,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(privateRef, {
        uid,
        email: (currentUser.email || '').slice(0, 254),
        lastCheckInDate: today,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
  }

  return {
    success: true,
    alreadyCheckedIn: false,
    currentStreak: newStreak,
    bestStreak,
    lastCheckInDate: today,
  };
}

export async function fetchUserProfileFromFirestore(identifier: string): Promise<User | null> {
  const clean = String(identifier || '').trim();
  if (!clean) return null;

  try {
    const byIdSnap = await getDoc(doc(db, 'users', sanitizeFirestoreId(clean)));
    if (byIdSnap.exists()) {
      const data = byIdSnap.data();
      const role = (data.role || 'player') as UserRole;
      return {
        id: String(data.id || byIdSnap.id),
        username: String(data.username || 'player'),
        displayName: String(data.displayName || data.username || 'Player'),
        robloxUsername: data.robloxUsername || '',
        avatar: data.avatar || '',
        bio: data.bio || '',
        roBeatsRank: data.roBeatsRank || 'Beginner',
        preferredNoteSpeed: data.preferredNoteSpeed || '1.8x',
        role,
        permissions: getPermissionsForRole(role),
        createdAt: normalizeTimestamp(data.createdAt),
        currentStreak: data.currentStreak ?? 0,
        bestStreak: data.bestStreak ?? 0,
      };
    }
  } catch {
    // Public get on /users/{id} may be restricted to owner/admin; fallback to API cleanly
  }
  return null;
}

export async function fetchAllUsersFromFirestore(): Promise<User[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    const list: User[] = snap.docs.map((d) => {
      const data = d.data();
      const role = (data.role || 'player') as UserRole;
      return {
        id: String(data.id || d.id),
        username: String(data.username || 'player'),
        displayName: String(data.displayName || data.username || 'Player'),
        robloxUsername: data.robloxUsername || '',
        avatar: data.avatar || '',
        bio: data.bio || '',
        roBeatsRank: data.roBeatsRank || 'Beginner',
        preferredNoteSpeed: data.preferredNoteSpeed || '1.8x',
        role,
        permissions: getPermissionsForRole(role),
        createdAt: normalizeTimestamp(data.createdAt),
        currentStreak: data.currentStreak ?? 0,
        bestStreak: data.bestStreak ?? 0,
      };
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateUserInFirestoreAsAdmin(
  targetUid: string,
  updates: { displayName?: string; avatar?: string; role?: UserRole }
): Promise<User | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Google Admin authentication required.');
  }
  const safeUid = sanitizeFirestoreId(targetUid);
  const userRef = doc(db, 'users', safeUid);
  const adminRef = doc(db, 'admins', safeUid);

  const userUpdate: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.displayName !== undefined) {
    userUpdate.displayName = String(updates.displayName).slice(0, 80);
  }
  if (updates.avatar !== undefined) userUpdate.avatar = String(updates.avatar).slice(0, 2048);
  if (updates.role !== undefined) userUpdate.role = updates.role;

  try {
    await updateDoc(userRef, userUpdate);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${safeUid}`);
  }

  if (updates.role === 'admin' || updates.role === 'staff') {
    try {
      const existingAdmin = await getDoc(adminRef);
      if (existingAdmin.exists()) {
        await updateDoc(adminRef, {
          role: updates.role,
          grantedBy: sanitizeFirestoreId(currentUser.uid),
        });
      } else {
        await setDoc(adminRef, {
          uid: safeUid,
          role: updates.role,
          grantedBy: sanitizeFirestoreId(currentUser.uid),
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${safeUid}`);
    }
  } else if (updates.role === 'player') {
    try {
      await deleteDoc(adminRef);
    } catch {
      // Ignore if admin role doc did not exist
    }
  }

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    const finalRole = (data.role || 'player') as UserRole;
    return {
      id: safeUid,
      username: String(data.username || 'player'),
      displayName: data.displayName || data.username,
      robloxUsername: data.robloxUsername || '',
      avatar: data.avatar || '',
      bio: data.bio || '',
      roBeatsRank: data.roBeatsRank || 'Beginner',
      preferredNoteSpeed: data.preferredNoteSpeed || '1.8x',
      role: finalRole,
      permissions: getPermissionsForRole(finalRole),
      createdAt: normalizeTimestamp(data.createdAt),
      currentStreak: data.currentStreak ?? 0,
      bestStreak: data.bestStreak ?? 0,
    };
  } catch {
    return null;
  }
}

export async function deleteUserInFirestoreAsAdmin(targetUid: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(targetUid);
  try {
    await deleteDoc(doc(db, 'admins', safeUid)).catch(() => {});
    await deleteDoc(doc(db, 'users', safeUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${safeUid}`);
  }
}
