import {
  CORS_HEADERS,
  jsonResponse,
  resolveFirestoreAuth,
  getFirestoreDocument,
} from '../../cloudflare/firestoreRest.js';

const DEFAULT_DIFFICULTY_FRAMES = {
  easy: '/frames/easy-frame.svg',
  normal: '',
  hard: '/frames/hard-frame.svg',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);
    let frames = null;

    try {
      frames = await getFirestoreDocument(env, 'settings/frames', authCtx.bearerToken);
    } catch (fsErr) {
      console.warn('[Cloudflare /api/frames GET] Firestore get error:', fsErr.message);
    }

    return jsonResponse(
      {
        easy: frames?.easy ?? DEFAULT_DIFFICULTY_FRAMES.easy,
        normal: frames?.normal ?? DEFAULT_DIFFICULTY_FRAMES.normal,
        hard: frames?.hard ?? DEFAULT_DIFFICULTY_FRAMES.hard,
      },
      200
    );
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Failed to load frames' }, 500);
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ error: `Method ${method} Not Allowed` }, 405);
}
