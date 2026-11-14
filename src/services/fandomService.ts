import {
  SongEntry,
  ElementConfig,
  RankConfig,
  DifficultyFramesConfig,
  DEFAULT_DIFFICULTY_FRAMES,
  DEFAULT_ROBEATS_RANKS,
  User,
  DiscordWebhooksConfig,
} from '../types';
import { buildDefaultElements } from '../constants/elements';
import { DEFAULT_GOOGLE_SHEET_URL, SHEET_SONGS } from '../constants/sheetSongs';
import {
  clearLiveSheetCache,
  getCachedLiveSheetSongs,
  mergeSongsWithSheetData,
} from './googleSheetsService';
import { safeJson } from '../utils/safeJson';
import { auth } from '../lib/firebase';
import {
  getFirebaseIdToken,
  fetchSongsFromFirestore,
  saveSongInFirestore,
  deleteSongInFirestore,
  fetchElementsFromFirestore,
  saveElementsInFirestore,
  fetchRanksFromFirestore,
  saveRanksInFirestore,
  fetchDifficultyFramesFromFirestore,
  saveDifficultyFramesInFirestore,
  fetchDiscordWebhooksFromFirestore,
  saveDiscordWebhooksInFirestore,
  fetchUserProfileFromFirestore,
  fetchPostByIdFromFirestore,
} from './firestoreService';

// In-memory cache for fast local access
let cachedSongs: SongEntry[] | null = null;
let cachedElements: ElementConfig[] | null = null;
let cachedRanks: RankConfig[] | null = null;
let cachedFrames: DifficultyFramesConfig | null = null;

function getAuthToken(): string | null {
  try {
    return localStorage.getItem('robeats_token') || localStorage.getItem('robeats_auth_token');
  } catch {
    return null;
  }
}

async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  const token = getAuthToken();
  const fbToken = await getFirebaseIdToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fbToken ? { 'X-Firebase-Token': fbToken } : {}),
  };
}

/**
 * Fetches all songs directly from Cloud Firestore (with API/seed fallback if empty).
 */
export async function fetchSongList(forceRefresh: boolean = false): Promise<SongEntry[]> {
  if (!forceRefresh && cachedSongs && cachedSongs.length > 0) {
    return cachedSongs;
  }

  let baseSongs: SongEntry[] = [];

  try {
    const fsSongs = await fetchSongsFromFirestore();
    if (fsSongs.length > 0) {
      baseSongs = fsSongs;
    }
  } catch (err) {
    console.warn('Firestore fetchSongs fallback:', err);
  }

  if (baseSongs.length === 0) {
    try {
      const res = await fetch('/api/songs');
      if (res.ok) {
        const data: SongEntry[] = await safeJson(res, []);
        if (Array.isArray(data) && data.length > 0) {
          baseSongs = data;
        }
      }
    } catch (err) {
      console.error('Error fetching songs from API fallback', err);
    }
  }

  if (baseSongs.length === 0) {
    baseSongs = cachedSongs && cachedSongs.length > 0 ? cachedSongs : DEFAULT_SEED_SONGS;
  }

  try {
    const liveSheetSongs = await getCachedLiveSheetSongs(DEFAULT_GOOGLE_SHEET_URL, forceRefresh);
    if (liveSheetSongs.length > 0) {
      baseSongs = mergeSongsWithSheetData(baseSongs, liveSheetSongs, {
        appendMissing: true,
        strictSheetCover: false,
      });
    }
  } catch (err) {
    console.warn('Live Google Sheet cover art merge skipped:', err);
  }

  cachedSongs = baseSongs;
  return baseSongs;
}

/**
 * Admin action: Add a song entry to Cloud Firestore
 */
export async function adminAddSong(song: Omit<SongEntry, 'id'>): Promise<SongEntry> {
  if (auth.currentUser) {
    const created = await saveSongInFirestore(song);
    if (cachedSongs) {
      cachedSongs = [created, ...cachedSongs];
    }
    return created;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/songs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(song),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to add song');
  }

  const created: SongEntry = await safeJson(res, song as any);
  if (cachedSongs) {
    cachedSongs = [created, ...cachedSongs];
  }
  return created;
}

/**
 * Admin action: Edit an existing song in Cloud Firestore
 */
export async function adminEditSong(songId: string, updates: Partial<SongEntry>): Promise<SongEntry> {
  if (auth.currentUser) {
    const baseSong = cachedSongs?.find((s) => s.id === songId);
    const merged = baseSong ? { ...baseSong, ...updates } : updates;
    const updated = await saveSongInFirestore(merged, songId);
    if (cachedSongs) {
      cachedSongs = cachedSongs.map((s) => (s.id === songId ? updated : s));
    }
    return updated;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch(`/api/songs/${encodeURIComponent(songId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to edit song');
  }

  const updated: SongEntry = await safeJson(res, { id: songId, ...updates } as any);
  if (cachedSongs) {
    cachedSongs = cachedSongs.map((s) => (s.id === songId ? updated : s));
  }
  return updated;
}

/**
 * Admin action: Delete a song from Cloud Firestore
 */
export async function adminDeleteSong(songId: string): Promise<void> {
  if (auth.currentUser) {
    await deleteSongInFirestore(songId);
    if (cachedSongs) {
      cachedSongs = cachedSongs.filter((s) => s.id !== songId);
    }
    return;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch(`/api/songs/${encodeURIComponent(songId)}`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to delete song');
  }

  if (cachedSongs) {
    cachedSongs = cachedSongs.filter((s) => s.id !== songId);
  }
}

export function adminResetOverrides() {
  cachedSongs = null;
  clearLiveSheetCache();
}

/**
 * Elements API: Fetch all configured element types and their image URLs
 */
export async function fetchElementsList(): Promise<ElementConfig[]> {
  try {
    const fsElements = await fetchElementsFromFirestore();
    if (fsElements.length > 0) {
      cachedElements = fsElements;
      return fsElements;
    }
  } catch (err) {
    console.warn('Firestore fetchElements fallback:', err);
  }

  try {
    const res = await fetch('/api/elements');
    if (res.ok) {
      const data: ElementConfig[] = await safeJson(res, []);
      if (Array.isArray(data) && data.length > 0) {
        cachedElements = data;
        return data;
      }
    }
  } catch (err) {
    console.error('Error fetching elements', err);
  }

  if (!cachedElements) {
    cachedElements = buildDefaultElements();
  }
  return cachedElements;
}

/**
 * Elements API: Update element image URLs in Cloud Firestore (Admin only)
 */
export async function updateElementsList(elements: ElementConfig[]): Promise<ElementConfig[]> {
  if (auth.currentUser) {
    const saved = await saveElementsInFirestore(elements);
    cachedElements = saved;
    return saved;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/elements', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(elements),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to update elements');
  }

  const result = await safeJson(res, {});
  cachedElements = result?.elements || elements;
  return cachedElements || elements;
}

/**
 * Discord Webhook API: Fetch current webhook configurations (Admin only)
 */
export async function fetchDiscordWebhooks(): Promise<Record<string, any>> {
  if (auth.currentUser) {
    return (await fetchDiscordWebhooksFromFirestore()) as Record<string, any>;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/admin/webhooks', {
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to fetch webhooks');
  }

  return safeJson(res, {});
}

/**
 * Discord Webhook API: Save webhook configurations to Cloud Firestore (Admin only)
 */
export async function updateDiscordWebhooks(config: Record<string, any>): Promise<Record<string, any>> {
  if (auth.currentUser) {
    return (await saveDiscordWebhooksInFirestore(config as DiscordWebhooksConfig)) as Record<string, any>;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/admin/webhooks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to update webhooks');
  }

  const data = await safeJson(res, {});
  return data?.webhooks || config;
}

/**
 * Discord Webhook API: Send test notification (Admin only)
 */
export async function testDiscordWebhook(category: string, webhookUrl?: string): Promise<{ success: boolean; message: string }> {
  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/admin/webhooks/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ category, webhookUrl }),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to test webhook');
  }

  return safeJson(res, { success: true, message: 'Test webhook delivered successfully' });
}

/**
 * Fetch Daily Mission Webhook Template definition and live sample
 */
export async function fetchDailyMissionTemplate(): Promise<{
  rawTemplate: string;
  defaultTitleTemplate: string;
  defaultBodyTemplate: string;
  defaultFooterTemplate: string;
  sampleFormatted: string;
}> {
  const res = await fetch('/api/admin/webhooks/daily-mission-template');
  if (!res.ok) {
    throw new Error('Failed to load Daily Mission template');
  }
  return safeJson(res, null as any);
}

/**
 * Fetch formatted Discord Webhook template for a specific post
 */
export async function fetchPostDiscordTemplate(postId: string): Promise<{
  rawTemplate: string;
  formattedDiscordText: string;
  starSongs: string;
  proSongs: string;
  amateurSongs: string;
  noviceSongs: string;
  beginnerSongs: string;
  posterName: string;
  postDate: string;
}> {
  const res = await fetch(`/api/news/${postId}/discord-template`);
  if (!res.ok) {
    throw new Error('Failed to load post Discord template');
  }
  return safeJson(res, null as any);
}

/**
 * Manual Discord Webhook publishing for an article (Staff and Admin only)
 */
export async function publishNewsToDiscordWebhook(
  postId: string,
  updatedPayload?: any
): Promise<{ success: boolean; message: string }> {
  const authHeaders = await getAuthHeadersAsync();
  let postData = updatedPayload ? { ...updatedPayload } : {};
  let webhookUrl = '';

  if (auth.currentUser) {
    if (!postData.category) {
      const existing = await fetchPostByIdFromFirestore(postId).catch(() => null);
      if (existing) {
        postData = { ...existing, ...postData };
      }
    }
    try {
      const hooks = await fetchDiscordWebhooksFromFirestore();
      const cat = postData.category as keyof DiscordWebhooksConfig | undefined;
      if (cat && hooks[cat]) {
        const entry = hooks[cat];
        webhookUrl = typeof entry === 'string' ? entry : entry?.url || '';
      }
    } catch {
      // Ignore if non-admin Staff triggers webhook without direct read access
    }
  }

  const res = await fetch(`/api/news/${postId}/publish-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      ...postData,
      ...(webhookUrl ? { webhookUrl } : {}),
    }),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to publish to Discord webhook');
  }

  return safeJson(res, { success: true, message: 'Webhook published' });
}

/**
 * Client-side fallback generator for Daily Mission Discord WebHook format
 */
export function generateDailyMissionDiscordText(post: any): string {
  const buckets: Record<'Star' | 'Pro' | 'Amateur' | 'Novice' | 'Beginner', Array<any>> = {
    Star: [],
    Pro: [],
    Amateur: [],
    Novice: [],
    Beginner: [],
  };

  const songs = post.songs || [];
  for (const song of songs) {
    const rawChosen = (song.chosenDifficulty || 'N').toUpperCase();
    const diffLetter = rawChosen.startsWith('E') ? 'E' : rawChosen.startsWith('H') ? 'H' : 'N';
    const diffVal =
      diffLetter === 'E'
        ? song.difficulty?.easy || '-'
        : diffLetter === 'H'
        ? song.difficulty?.hard || '-'
        : song.difficulty?.normal || '-';
    const difficultyText = diffLetter === 'E' ? 'Easy' : diffLetter === 'H' ? 'Hard' : 'Normal';
    const isNoMisses = Boolean(song.noMisses || song.isNoMisses);

    let rank = song.missionRank;
    if (!rank) {
      const numLevel = parseInt(diffVal, 10);
      if (!isNaN(numLevel) && numLevel > 0) {
        if (numLevel >= 25) rank = 'Star';
        else if (numLevel >= 20) rank = 'Pro';
        else if (numLevel >= 15) rank = 'Amateur';
        else if (numLevel >= 8) rank = 'Novice';
        else rank = 'Beginner';
      } else {
        rank = post.missionRank || 'Beginner';
      }
    }

    const cleanLevel = diffVal !== '-' ? diffVal : '1';
    const songItem = {
      level: cleanLevel,
      title: song.title || 'Unknown Song',
      artist: song.artist || 'Unknown Artist',
      element: song.element || 'Standard',
      isNoMisses,
      difficultyText,
    };

    if (rank && buckets[rank as keyof typeof buckets]) {
      buckets[rank as keyof typeof buckets].push(songItem);
    } else {
      buckets.Beginner.push(songItem);
    }
  }

  const formatList = (items: Array<any>, _rankType: 'Star' | 'Pro' | 'Amateur' | 'Novice' | 'Beginner') => {
    if (items.length === 0) return '- "No missions" - None';
    return items
      .map((s) => {
        const elementStr = s.element || 'Standard';
        const artistStr = s.artist || 'Unknown Artist';
        if (s.isNoMisses) {
          return `- :star: [${s.level}] ${elementStr} / ${s.title} - ${artistStr} [${s.difficultyText}] (No Misses)`;
        }
        return `- [${s.level}] ${elementStr} / ${s.title} - ${artistStr} [${s.difficultyText}]`;
      })
      .join('\n');
  };

  const starSongs = formatList(buckets.Star, 'Star');
  const proSongs = formatList(buckets.Pro, 'Pro');
  const amateurSongs = formatList(buckets.Amateur, 'Amateur');
  const noviceSongs = formatList(buckets.Novice, 'Novice');
  const beginnerSongs = formatList(buckets.Beginner, 'Beginner');

  const posterName = post.author?.name || 'Poster';
  const postDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return [
    `Header: " ${post.title || 'Today daily missions'}"`,
    `## <:star:1295611495383695451> - Star missions`,
    starSongs,
    ``,
    `## <:pro:1295611421866070016> - Pro missions`,
    proSongs,
    ``,
    `## <:amateur:1295611203325792287> - Amateur missions`,
    amateurSongs,
    ``,
    `## <:novice:1284381928044367944> - Novice missions`,
    noviceSongs,
    ``,
    `## <:beginner:1284381903578861578> \n - Beginner missions`,
    beginnerSongs,
    ``,
    `Poster: "${posterName}" | Post date: "${postDate}"`,
  ].join('\n');
}

/**
 * Fetch all RoBeats ranks from Cloud Firestore (Star, Pro, Amateur, Novice, Beginner)
 */
export async function fetchRanksList(forceRefresh: boolean = false): Promise<RankConfig[]> {
  if (!forceRefresh && cachedRanks && cachedRanks.length > 0) {
    return cachedRanks;
  }

  try {
    const fsRanks = await fetchRanksFromFirestore();
    cachedRanks = fsRanks;
    return fsRanks;
  } catch (err) {
    console.warn('Firestore fetchRanks fallback:', err);
  }

  try {
    const res = await fetch('/api/ranks');
    if (res.ok) {
      const ranks = await safeJson(res, []);
      if (Array.isArray(ranks) && ranks.length > 0) {
        cachedRanks = ranks;
        return ranks;
      }
    }
  } catch (err) {
    console.error('Failed to load ranks:', err);
  }

  return DEFAULT_ROBEATS_RANKS;
}

/**
 * Update a specific rank's configuration in Cloud Firestore (Admin only)
 */
export async function updateRankConfig(id: string, updates: Partial<RankConfig>): Promise<RankConfig> {
  if (auth.currentUser) {
    const current = cachedRanks || (await fetchRanksFromFirestore());
    const nextRanks = current.map((r) => (r.id === id ? { ...r, ...updates } : r));
    await saveRanksInFirestore(nextRanks);
    cachedRanks = nextRanks;
    return nextRanks.find((r) => r.id === id) || ({ id, ...updates } as RankConfig);
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch(`/api/admin/ranks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to update rank');
  }

  const result = await safeJson(res, {});
  if (result?.ranks) cachedRanks = result.ranks;
  return result?.rank || ({ id, ...updates } as RankConfig);
}

/**
 * Batch update ranks in Cloud Firestore (Admin only)
 */
export async function updateAllRanks(ranks: RankConfig[]): Promise<RankConfig[]> {
  if (auth.currentUser) {
    const saved = await saveRanksInFirestore(ranks);
    cachedRanks = saved;
    return saved;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/admin/ranks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ ranks }),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to update ranks');
  }

  const result = await safeJson(res, ranks);
  const finalRanks: RankConfig[] = Array.isArray(result) ? result : result?.ranks || ranks;
  cachedRanks = finalRanks;
  return finalRanks;
}

/**
 * Fetch difficulty cover art frames from Cloud Firestore
 */
export async function fetchDifficultyFrames(forceRefresh: boolean = false): Promise<DifficultyFramesConfig> {
  if (!forceRefresh && cachedFrames) {
    return cachedFrames;
  }
  try {
    const fsFrames = await fetchDifficultyFramesFromFirestore();
    cachedFrames = fsFrames;
    return fsFrames;
  } catch (err) {
    console.warn('Firestore fetchDifficultyFrames fallback:', err);
  }

  try {
    const res = await fetch('/api/frames');
    if (!res.ok) throw new Error('Failed to fetch difficulty frames');
    const data = await safeJson(res, DEFAULT_DIFFICULTY_FRAMES);
    cachedFrames = data;
    return data;
  } catch (err) {
    console.error('Failed to load frames:', err);
    return DEFAULT_DIFFICULTY_FRAMES;
  }
}

/**
 * Update difficulty cover art frames in Cloud Firestore (Admin only)
 */
export async function updateDifficultyFrames(frames: DifficultyFramesConfig): Promise<DifficultyFramesConfig> {
  if (auth.currentUser) {
    const saved = await saveDifficultyFramesInFirestore(frames);
    cachedFrames = saved;
    return saved;
  }

  const authHeaders = await getAuthHeadersAsync();
  const res = await fetch('/api/admin/frames', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(frames),
  });

  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to update difficulty frames');
  }

  const result = await safeJson(res, {});
  const finalFrames: DifficultyFramesConfig = result?.frames || frames;
  cachedFrames = finalFrames;
  return finalFrames;
}

export const DEFAULT_SEED_SONGS: SongEntry[] = SHEET_SONGS;

export async function fetchUserProfile(identifier: string): Promise<User> {
  const fsUser = await fetchUserProfileFromFirestore(identifier);
  if (fsUser) return fsUser;

  const res = await fetch(`/api/users/${encodeURIComponent(identifier)}`);
  if (!res.ok) {
    const err = await safeJson(res, {});
    throw new Error(err?.error || 'Failed to fetch user profile');
  }
  return safeJson(res, null as any);
}
