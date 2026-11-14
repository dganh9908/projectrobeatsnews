import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  queryFirestoreCollection,
  commitFirestoreDocument,
} from '../../cloudflare/firestoreRest.js';

const DEFAULT_SEED_SONGS = [
  {
    id: 'seed_1',
    title: 'Monday Night Monsters',
    artist: 'FinnMK',
    coverArt: 'https://static.wikia.nocookie.net/robeats/images/f/f6/Mondaynightnormal.png/revision/latest/scale-to-width-down/100?cb=20200703131704',
    coverArtEasy: 'https://static.wikia.nocookie.net/robeats/images/f/f6/Mondaynightnormal.png/revision/latest/scale-to-width-down/100?cb=20200703131704',
    coverArtNormal: 'https://static.wikia.nocookie.net/robeats/images/f/f6/Mondaynightnormal.png/revision/latest/scale-to-width-down/100?cb=20200703131704',
    coverArtHard: 'https://static.wikia.nocookie.net/robeats/images/f/f6/Mondaynightnormal.png/revision/latest/scale-to-width-down/100?cb=20200703131704',
    difficulty: { easy: '1', normal: '1', hard: '14' },
    element: 'Flow',
    duration: '2:14',
    bpm: '100',
  },
  {
    id: 'seed_2',
    title: 'Daily Life',
    artist: 'FinnMK',
    coverArt: 'https://static.wikia.nocookie.net/robeats/images/0/04/Daily_life.png/revision/latest/scale-to-width-down/100?cb=20210628193437',
    coverArtEasy: 'https://static.wikia.nocookie.net/robeats/images/0/04/Daily_life.png/revision/latest/scale-to-width-down/100?cb=20210628193437',
    coverArtNormal: 'https://static.wikia.nocookie.net/robeats/images/0/04/Daily_life.png/revision/latest/scale-to-width-down/100?cb=20210628193437',
    coverArtHard: 'https://static.wikia.nocookie.net/robeats/images/0/04/Daily_life.png/revision/latest/scale-to-width-down/100?cb=20210628193437',
    difficulty: { easy: '-', normal: '2', hard: '17' },
    element: 'Chill',
    duration: '2:02',
    bpm: '106',
  },
];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);
    let songs = [];

    try {
      songs = await queryFirestoreCollection(env, 'songs', null, authCtx.bearerToken);
    } catch (fsErr) {
      console.warn('[Cloudflare /api/songs GET] Firestore query error:', fsErr.message);
    }

    if (!Array.isArray(songs) || songs.length === 0) {
      songs = DEFAULT_SEED_SONGS;
    }

    return jsonResponse(songs, 200);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Failed to read songs' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.bearerToken) {
      return jsonResponse(
        { error: 'Admin Firebase authentication required to add songs via Cloudflare.' },
        401
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
    }

    if (!body.title) {
      return jsonResponse({ error: 'Title is required' }, 400);
    }

    const songId = sanitizeId(body.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const primaryCover = String(body.coverArt || body.coverArtNormal || '').trim().slice(0, 2048);

    const newSong = {
      id: songId,
      title: String(body.title).trim().slice(0, 200),
      artist: String(body.artist || 'Unknown Artist').trim().slice(0, 200),
      ...(body.mapper ? { mapper: String(body.mapper).trim().slice(0, 120) } : {}),
      coverArt: primaryCover,
      coverArtEasy: primaryCover,
      coverArtNormal: primaryCover,
      coverArtHard: primaryCover,
      difficulty: {
        easy: String(body.difficulty?.easy || '-'),
        normal: String(body.difficulty?.normal || '-'),
        hard: String(body.difficulty?.hard || '-'),
      },
      element: String(body.element || 'Standard').slice(0, 64),
      duration: String(body.duration || '').slice(0, 32),
      bpm: String(body.bpm || '').slice(0, 32),
      dateAdded: new Date().toLocaleDateString('en-US'),
      isCustom: true,
    };

    await commitFirestoreDocument(env, `songs/${songId}`, newSong, {
      isCreate: true,
      bearerToken: authCtx.bearerToken,
    });

    return jsonResponse(newSong, 201);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Failed to add song' }, 500);
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ error: `Method ${method} Not Allowed` }, 405);
}
