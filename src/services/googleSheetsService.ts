import { SongEntry } from '../types';
import { DEFAULT_GOOGLE_SHEET_ID, DEFAULT_GOOGLE_SHEET_URL } from '../constants/sheetSongs';
import { normalizeElementName } from '../constants/elements';

export interface ParsedSheetSong {
  id: string;
  title: string;
  artist: string;
  mapper: string;
  coverArt: string;
  difficulty: {
    easy: string;
    normal: string;
    hard: string;
  };
  element: string;
  bpm?: string;
  duration?: string;
}

const SHEET_CACHE_TTL_MS = 60_000;
let cachedSheetUrl = '';
let cachedSheetAt = 0;
let cachedSheetSongs: ParsedSheetSong[] | null = null;
let inFlightSheetPromise: Promise<ParsedSheetSong[]> | null = null;

export function clearLiveSheetCache(): void {
  cachedSheetUrl = '';
  cachedSheetAt = 0;
  cachedSheetSongs = null;
  inFlightSheetPromise = null;
}

export function extractGoogleSheetParams(input: string): { spreadsheetId: string; gid?: string } {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return { spreadsheetId: DEFAULT_GOOGLE_SHEET_ID };
  }

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = idMatch ? idMatch[1] : trimmed.replace(/[^a-zA-Z0-9-_]/g, '');

  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  return {
    spreadsheetId: spreadsheetId || DEFAULT_GOOGLE_SHEET_ID,
    gid: gidMatch ? gidMatch[1] : undefined,
  };
}

function makeSheetSlugId(title: string, artist: string, usedIds: Set<string>): string {
  const raw = `${title}_${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  const base = `sheet_${raw || 'song'}`;
  let id = base;
  let counter = 2;
  while (usedIds.has(id)) {
    id = `${base.slice(0, 110)}_${counter}`;
    counter++;
  }
  usedIds.add(id);
  return id;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

export function normalizeCoverUrl(raw: string): string {
  let trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  // Support =IMAGE("https://...") formula strings if exported as formula text
  const formulaMatch = trimmed.match(/^=IMAGE\(\s*["']([^"']+)["']/i);
  if (formulaMatch) {
    trimmed = formulaMatch[1].trim();
  }

  // Convert Google Drive share URLs into direct image URLs usable by <img>
  const driveFileMatch = trimmed.match(/^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }
  const driveIdMatch = trimmed.match(
    /^https?:\/\/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i
  );
  if (driveIdMatch) {
    return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, 2048);
  }
  return '';
}

function normalizeDiffValue(raw: string): string {
  const trimmed = String(raw || '').trim();
  return trimmed || '-';
}

function findHeaderColIndex(labels: string[], patterns: RegExp[], fallbackIdx: number): number {
  const idx = labels.findIndex((label) => {
    const clean = label.trim().toLowerCase();
    return clean.length > 0 && patterns.some((p) => p.test(clean));
  });
  return idx !== -1 ? idx : fallbackIdx;
}

export async function fetchSongsFromGoogleSheet(
  sheetUrlOrId: string = DEFAULT_GOOGLE_SHEET_URL,
  options?: { timeoutMs?: number }
): Promise<ParsedSheetSong[]> {
  const { spreadsheetId, gid } = extractGoogleSheetParams(sheetUrlOrId);
  const gidParam = gid ? `&gid=${encodeURIComponent(gid)}` : '';
  const cacheBust = `&_ts=${Date.now()}`;
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:json${gidParam}${cacheBust}`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    controller && options?.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null;

  try {
    try {
      const res = await fetch(gvizUrl, controller ? { signal: controller.signal } : undefined);
      if (res.ok) {
        const text = await res.text();
        const jsonStr = text.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, '');
        const parsed = JSON.parse(jsonStr);
        const cols: Array<{ label?: string }> = parsed?.table?.cols || [];
        const rows: Array<{ c?: Array<{ v?: any; f?: string } | null> }> = parsed?.table?.rows || [];

        const labels = cols.map((c) => String(c?.label || ''));
        const titleIdx = findHeaderColIndex(labels, [/song\s*title/, /^title$/, /^song$/], 0);
        const coverIdx = findHeaderColIndex(labels, [/cover\s*arts?/, /cover/, /image/, /art/], 1);
        const artistIdx = findHeaderColIndex(labels, [/artists?/], 2);
        const easyIdx = findHeaderColIndex(labels, [/easy/], 3);
        const normalIdx = findHeaderColIndex(labels, [/normal/], 4);
        const hardIdx = findHeaderColIndex(labels, [/hard/], 5);
        const elementIdx = findHeaderColIndex(labels, [/elements?/], 6);

        const usedIds = new Set<string>();
        const songs: ParsedSheetSong[] = [];

        for (const r of rows) {
          const cells = r?.c || [];
          const getVal = (idx: number) => {
            const cell = cells[idx];
            if (!cell) return '';
            const raw = cell.f !== undefined && cell.f !== null ? cell.f : cell.v;
            return raw === null || raw === undefined ? '' : String(raw).trim();
          };
          const getCoverCellVal = (idx: number) => {
            const cell = cells[idx];
            if (!cell) return '';
            const vStr = cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : '';
            const fStr = cell.f !== null && cell.f !== undefined ? String(cell.f).trim() : '';
            if (/https?:\/\//i.test(vStr)) return vStr;
            if (/https?:\/\//i.test(fStr)) return fStr;
            return fStr || vStr;
          };

          const title = getVal(titleIdx);
          if (!title || title.toLowerCase() === 'song title') continue;

          const artist = getVal(artistIdx) || 'Unknown Artist';
          const coverArt = normalizeCoverUrl(getCoverCellVal(coverIdx));
          const easy = normalizeDiffValue(getVal(easyIdx));
          const normal = normalizeDiffValue(getVal(normalIdx));
          const hard = normalizeDiffValue(getVal(hardIdx));
          const element = normalizeElementName(getVal(elementIdx));

          songs.push({
            id: makeSheetSlugId(title, artist, usedIds),
            title: title.slice(0, 200),
            artist: artist.slice(0, 200),
            mapper: 'Official RoBeats',
            coverArt,
            difficulty: {
              easy: easy.slice(0, 16),
              normal: normal.slice(0, 16),
              hard: hard.slice(0, 16),
            },
            element: element.slice(0, 64),
          });
        }

        if (songs.length > 0) {
          return songs;
        }
      }
    } catch (err) {
      console.warn('Google Sheet gviz JSON fetch failed, trying CSV export:', err);
    }

    // Fallback to CSV export with dynamic header detection
    const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv${gidParam}`;
    const csvRes = await fetch(csvUrl, controller ? { signal: controller.signal } : undefined);
    if (!csvRes.ok) {
      throw new Error(
        `Could not load Google Sheet (HTTP ${csvRes.status}). Make sure the sheet is shared as "Anyone with the link can view".`
      );
    }

    const csvText = await csvRes.text();
    const rows = parseCsvRows(csvText);
    const headerLabels = rows[0] || [];
    const hasHeader = headerLabels.some((h) => /song|title|cover|artist/i.test(h));

    const titleIdx = hasHeader ? findHeaderColIndex(headerLabels, [/song\s*title/, /^title$/, /^song$/], 0) : 0;
    const coverIdx = hasHeader ? findHeaderColIndex(headerLabels, [/cover\s*arts?/, /cover/, /image/, /art/], 1) : 1;
    const artistIdx = hasHeader ? findHeaderColIndex(headerLabels, [/artists?/], 2) : 2;
    const easyIdx = hasHeader ? findHeaderColIndex(headerLabels, [/easy/], 3) : 3;
    const normalIdx = hasHeader ? findHeaderColIndex(headerLabels, [/normal/], 4) : 4;
    const hardIdx = hasHeader ? findHeaderColIndex(headerLabels, [/hard/], 5) : 5;
    const elementIdx = hasHeader ? findHeaderColIndex(headerLabels, [/elements?/], 6) : 6;

    const usedIds = new Set<string>();
    const songs: ParsedSheetSong[] = [];

    for (let idx = hasHeader ? 1 : 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const title = String(row[titleIdx] || '').trim();
      if (!title || title.toLowerCase() === 'song title') continue;
      if (String(row[easyIdx] || '').trim().toLowerCase() === 'easy') continue;

      const artist = String(row[artistIdx] || '').trim() || 'Unknown Artist';
      const coverArt = normalizeCoverUrl(row[coverIdx] || '');
      const easy = normalizeDiffValue(row[easyIdx] || '');
      const normal = normalizeDiffValue(row[normalIdx] || '');
      const hard = normalizeDiffValue(row[hardIdx] || '');
      const element = normalizeElementName(row[elementIdx] || '');

      songs.push({
        id: makeSheetSlugId(title, artist, usedIds),
        title: title.slice(0, 200),
        artist: artist.slice(0, 200),
        mapper: 'Official RoBeats',
        coverArt,
        difficulty: {
          easy: easy.slice(0, 16),
          normal: normal.slice(0, 16),
          hard: hard.slice(0, 16),
        },
        element: element.slice(0, 64),
      });
    }

    if (songs.length === 0) {
      throw new Error('No song rows found in the Google Sheet.');
    }

    return songs;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function getCachedLiveSheetSongs(
  sheetUrlOrId: string = DEFAULT_GOOGLE_SHEET_URL,
  forceRefresh: boolean = false
): Promise<ParsedSheetSong[]> {
  const { spreadsheetId, gid } = extractGoogleSheetParams(sheetUrlOrId);
  const cacheKey = `${spreadsheetId}:${gid || ''}`;
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedSheetSongs &&
    cachedSheetUrl === cacheKey &&
    now - cachedSheetAt < SHEET_CACHE_TTL_MS
  ) {
    return cachedSheetSongs;
  }

  if (!forceRefresh && inFlightSheetPromise && cachedSheetUrl === cacheKey) {
    return inFlightSheetPromise;
  }

  cachedSheetUrl = cacheKey;
  inFlightSheetPromise = fetchSongsFromGoogleSheet(sheetUrlOrId, { timeoutMs: 4500 })
    .then((songs) => {
      cachedSheetSongs = songs;
      cachedSheetAt = Date.now();
      inFlightSheetPromise = null;
      return songs;
    })
    .catch((err) => {
      inFlightSheetPromise = null;
      throw err;
    });

  return inFlightSheetPromise;
}

export function mapParsedSheetSongToEntry(item: ParsedSheetSong): SongEntry {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    mapper: item.mapper,
    coverArt: item.coverArt,
    coverArtEasy: item.coverArt,
    coverArtNormal: item.coverArt,
    coverArtHard: item.coverArt,
    difficulty: item.difficulty,
    element: item.element,
    bpm: item.bpm || '',
    duration: item.duration || '',
    isCustom: false,
  };
}

/**
 * Merges cover art URLs, elements (and optionally missing songs) from Google Sheet onto base songs.
 * Whenever the Sheet has a cover art URL or Element for song A, that value becomes song A's cover art / element.
 */
export function mergeSongsWithSheetData(
  baseSongs: SongEntry[],
  sheetSongs: ParsedSheetSong[],
  options?: { appendMissing?: boolean; strictSheetCover?: boolean; strictSheetElement?: boolean }
): SongEntry[] {
  if (!Array.isArray(sheetSongs) || sheetSongs.length === 0) {
    return baseSongs.map((s) => ({
      ...s,
      element: normalizeElementName(s.element),
    }));
  }

  const byTitleArtist = new Map<string, ParsedSheetSong>();
  const byTitleCount = new Map<string, number>();
  const byTitleUnique = new Map<string, ParsedSheetSong>();

  for (const s of sheetSongs) {
    const t = s.title.toLowerCase().trim();
    const a = s.artist.toLowerCase().trim();
    const key = `${t}::${a}`;
    if (!byTitleArtist.has(key)) {
      byTitleArtist.set(key, s);
    }
    const count = (byTitleCount.get(t) || 0) + 1;
    byTitleCount.set(t, count);
    if (count === 1) {
      byTitleUnique.set(t, s);
    } else {
      byTitleUnique.delete(t);
    }
  }

  const seenKeys = new Set<string>();
  const merged = baseSongs.map((song) => {
    const normalizedExistingElement = normalizeElementName(song.element);
    const t = String(song.title || '').toLowerCase().trim();
    const a = String(song.artist || '').toLowerCase().trim();
    const key = `${t}::${a}`;
    seenKeys.add(key);

    const sheetMatch = byTitleArtist.get(key) || byTitleUnique.get(t);
    if (!sheetMatch) {
      return normalizedExistingElement === (song.element || '')
        ? song
        : { ...song, element: normalizedExistingElement };
    }

    const sheetCover = sheetMatch.coverArt.trim();
    const sheetElement = normalizeElementName(sheetMatch.element);
    const nextElement = sheetElement || (options?.strictSheetElement ? '' : normalizedExistingElement);

    const updatedCover = sheetCover || options?.strictSheetCover;
    const coverChanged =
      updatedCover &&
      (song.coverArt !== sheetCover ||
        song.coverArtNormal !== sheetCover ||
        song.coverArtEasy !== sheetCover ||
        song.coverArtHard !== sheetCover);
    const elementChanged = nextElement !== (song.element || '');

    if (!coverChanged && !elementChanged) {
      return song;
    }

    return {
      ...song,
      ...(updatedCover
        ? {
            coverArt: sheetCover,
            coverArtEasy: sheetCover,
            coverArtNormal: sheetCover,
            coverArtHard: sheetCover,
          }
        : {}),
      element: nextElement,
    };
  });

  if (options?.appendMissing !== false) {
    for (const sheetSong of sheetSongs) {
      const key = `${sheetSong.title.toLowerCase().trim()}::${sheetSong.artist.toLowerCase().trim()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        merged.push(mapParsedSheetSongToEntry(sheetSong));
      }
    }
  }

  return merged;
}
