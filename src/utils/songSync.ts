import { SongEntry } from '../types';
import { normalizeElementName } from '../constants/elements';

export const SONGS_UPDATED_EVENT = 'robeats-songs-updated';

export interface SongsUpdatedEventDetail {
  updatedSongs?: SongEntry[];
  deletedSongId?: string;
  forceRefresh?: boolean;
}

export function dispatchSongsUpdatedEvent(detail: SongsUpdatedEventDetail = {}): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<SongsUpdatedEventDetail>(SONGS_UPDATED_EVENT, { detail }));
  } catch {
    // Ignore in non-DOM contexts
  }
}

export interface SongCatalogLookup {
  byId: Map<string, SongEntry>;
  byTitleArtist: Map<string, SongEntry>;
  byTitleUnique: Map<string, SongEntry>;
}

export function buildCatalogLookup(catalog: SongEntry[]): SongCatalogLookup {
  const byId = new Map<string, SongEntry>();
  const byTitleArtist = new Map<string, SongEntry>();
  const byTitleCount = new Map<string, number>();
  const byTitleUnique = new Map<string, SongEntry>();

  for (const s of catalog) {
    if (!s) continue;
    if (s.id) {
      byId.set(s.id, s);
    }
    const t = String(s.title || '').toLowerCase().trim();
    const a = String(s.artist || '').toLowerCase().trim();
    const key = `${t}::${a}`;
    if (t && !byTitleArtist.has(key)) {
      byTitleArtist.set(key, s);
    }
    if (t) {
      const count = (byTitleCount.get(t) || 0) + 1;
      byTitleCount.set(t, count);
      if (count === 1) {
        byTitleUnique.set(t, s);
      } else {
        byTitleUnique.delete(t);
      }
    }
  }

  return { byId, byTitleArtist, byTitleUnique };
}

export function mergePostSongWithCatalog(postSong: SongEntry, lookup: SongCatalogLookup): SongEntry {
  const t = String(postSong.title || '').toLowerCase().trim();
  const a = String(postSong.artist || '').toLowerCase().trim();
  const catalogMatch =
    (postSong.id ? lookup.byId.get(postSong.id) : undefined) ||
    (t ? lookup.byTitleArtist.get(`${t}::${a}`) : undefined) ||
    (t ? lookup.byTitleUnique.get(t) : undefined);

  if (!catalogMatch) {
    const cleanEl = normalizeElementName(postSong.element);
    return cleanEl === (postSong.element || '')
      ? postSong
      : { ...postSong, element: cleanEl };
  }

  const nextCover =
    catalogMatch.coverArt !== undefined
      ? catalogMatch.coverArt
      : catalogMatch.coverArtNormal || catalogMatch.coverArtEasy || catalogMatch.coverArtHard || postSong.coverArt || '';

  return {
    ...postSong,
    id: catalogMatch.id || postSong.id,
    title: catalogMatch.title || postSong.title,
    artist: catalogMatch.artist || postSong.artist,
    mapper: catalogMatch.mapper !== undefined ? catalogMatch.mapper : postSong.mapper,
    coverArt: nextCover,
    coverArtEasy: catalogMatch.coverArtEasy !== undefined ? catalogMatch.coverArtEasy : nextCover,
    coverArtNormal: catalogMatch.coverArtNormal !== undefined ? catalogMatch.coverArtNormal : nextCover,
    coverArtHard: catalogMatch.coverArtHard !== undefined ? catalogMatch.coverArtHard : nextCover,
    difficulty: catalogMatch.difficulty || postSong.difficulty,
    element: normalizeElementName(
      catalogMatch.element !== undefined ? catalogMatch.element : postSong.element
    ),
    bpm: catalogMatch.bpm !== undefined ? catalogMatch.bpm : postSong.bpm,
    duration: catalogMatch.duration !== undefined ? catalogMatch.duration : postSong.duration,
  };
}

export function applyCatalogUpdatesToSongs(
  postSongs: SongEntry[] | undefined,
  catalog: SongEntry[]
): SongEntry[] | undefined {
  if (!Array.isArray(postSongs) || postSongs.length === 0) {
    return postSongs;
  }

  if (!Array.isArray(catalog) || catalog.length === 0) {
    return postSongs.map((s) => ({
      ...s,
      element: normalizeElementName(s.element),
    }));
  }

  const lookup = buildCatalogLookup(catalog);
  return postSongs.map((s) => mergePostSongWithCatalog(s, lookup));
}
