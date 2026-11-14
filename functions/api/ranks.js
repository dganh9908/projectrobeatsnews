import {
  CORS_HEADERS,
  jsonResponse,
  resolveFirestoreAuth,
  queryFirestoreCollection,
} from '../../cloudflare/firestoreRest.js';

const DEFAULT_ROBEATS_RANKS = [
  { id: 'star', name: 'Star', iconUrl: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/star.svg', color: '#F59E0B', description: 'Elite RoBeats master rhythm players' },
  { id: 'pro', name: 'Pro', iconUrl: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/zap.svg', color: '#A855F7', description: 'High tier competitive rhythm champions' },
  { id: 'amateur', name: 'Amateur', iconUrl: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/award.svg', color: '#3B82F6', description: 'Skilled rhythm players clearing advanced charts' },
  { id: 'novice', name: 'Novice', iconUrl: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/activity.svg', color: '#10B981', description: 'Intermediate rhythm players learning higher speeds' },
  { id: 'beginner', name: 'Beginner', iconUrl: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/disc.svg', color: '#64748B', description: 'Starting rhythm players beginning their journey' },
];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);
    let ranks = [];

    try {
      ranks = await queryFirestoreCollection(env, 'ranks', null, authCtx.bearerToken);
    } catch (fsErr) {
      console.warn('[Cloudflare /api/ranks GET] Firestore query error:', fsErr.message);
    }

    if (!Array.isArray(ranks) || ranks.length === 0) {
      ranks = DEFAULT_ROBEATS_RANKS;
    }

    return jsonResponse(ranks, 200);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Failed to fetch ranks' }, 500);
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ error: `Method ${method} Not Allowed` }, 405);
}
