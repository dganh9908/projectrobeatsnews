import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  queryFirestoreCollection,
  commitFirestoreDocument,
} from '../../cloudflare/firestoreRest.js';

const DEFAULT_SEED_POSTS = [
  {
    id: 'post-daily-missions-initial',
    title: 'Today daily missions',
    subtitle: "Complete today's daily mission tracks to earn bonus Star Coins, EXP, and rank badges!",
    content: "Attention RoBeats players! Today's daily missions are officially live. Clear all featured tracks with at least an A rank or 90%+ accuracy to claim your mission rewards.",
    summary: "Complete today's daily mission tracks to earn bonus Star Coins, EXP, and rank badges!",
    category: 'Daily mission',
    author: {
      name: 'Meelo',
      role: 'Admin',
      avatar: 'https://down-vn.img.susercontent.com/file/sg-11134201-81zwv-mih44jns7q4n42',
    },
    publishedAt: '2026-10-17T00:19:22.047Z',
    updatedAt: '2026-10-21T04:04:47.740Z',
    readTime: '1 min read',
    status: 'published',
    tags: ['Daily mission', 'RoBeats', 'Songs'],
    views: 28,
    songs: [],
    reactions: { '🔥': 4 },
    comments: [],
  },
];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const category = url.searchParams.get('category');

    const authCtx = await resolveFirestoreAuth(request, env);
    let posts = [];

    try {
      posts = await queryFirestoreCollection(
        env,
        'posts',
        { field: 'status', op: 'EQUAL', value: 'published' },
        authCtx.bearerToken
      );
    } catch (fsErr) {
      console.warn('[Cloudflare /api/news GET] Firestore query error:', fsErr.message);
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      posts = DEFAULT_SEED_POSTS;
    }

    if (category && category !== 'All') {
      const catLower = category.toLowerCase();
      posts = posts.filter((p) => String(p.category || '').toLowerCase() === catLower);
    }

    posts.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());

    return jsonResponse(posts, 200);
  } catch (err) {
    return jsonResponse(
      { success: false, error: err?.message || 'Failed to load news posts' },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON request body.' }, 400);
    }

    const authCtx = await resolveFirestoreAuth(request, env);
    const isAppStaffOrAdmin =
      authCtx.appToken &&
      (authCtx.appToken.includes('admin') || authCtx.appToken.includes('staff') || authCtx.appToken.includes('meelo'));

    if (!authCtx.bearerToken && !isAppStaffOrAdmin) {
      return jsonResponse(
        { success: false, error: 'Authentication required to publish posts via Cloudflare.' },
        401
      );
    }

    const category = String(body.category || 'Daily mission').slice(0, 64);
    let autoTitle = 'Daily missions';
    if (category === 'Weekly mission') autoTitle = 'Weekly missions';
    else if (category === 'Weekly Leaderboard') autoTitle = 'Weekly Leaderboard';
    else if (category === 'New song') autoTitle = 'New Song Release';
    else if (category === 'Updates') autoTitle = 'RoBeats Game Update';

    const postId = sanitizeId(body.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const title = String(body.title || autoTitle).trim().slice(0, 200);
    const content = String(body.content || '').trim().slice(0, 20000);
    const subtitle = String(body.subtitle || '').trim().slice(0, 300);
    const summary = String(body.summary || subtitle || content.slice(0, 120)).slice(0, 500);
    const nowIso = new Date().toISOString();
    const authorUid = sanitizeId(authCtx.uid || 'usr_admin_meelo');

    const safeTags = Array.isArray(body.tags)
      ? body.tags.filter((t) => typeof t === 'string').slice(0, 15)
      : [category, 'RoBeats'];
    const safeSongs = Array.isArray(body.songs) ? body.songs.slice(0, 20) : [];
    const finalCover =
      (body.coverImage && String(body.coverImage).trim().slice(0, 2048)) ||
      (safeSongs[0]?.coverArt && String(safeSongs[0].coverArt).slice(0, 2048)) ||
      undefined;

    const postDoc = {
      id: postId,
      title,
      subtitle,
      content,
      summary,
      category,
      authorUid,
      author: {
        name: body.author?.name || (authCtx.email ? authCtx.email.split('@')[0] : 'Meelo'),
        role: body.author?.role || 'Admin',
        avatar: body.author?.avatar || 'https://down-vn.img.susercontent.com/file/sg-11134201-81zwv-mih44jns7q4n42',
      },
      publishedAt: nowIso,
      readTime: '1 min read',
      ...(finalCover ? { coverImage: finalCover } : {}),
      coverImageCaption: String(body.coverImageCaption || '').slice(0, 300),
      isBreaking: Boolean(body.isBreaking),
      isFeatured: Boolean(body.isFeatured),
      isTrending: false,
      ...(body.missionRank ? { missionRank: String(body.missionRank).slice(0, 32) } : {}),
      status: 'published',
      tags: safeTags,
      views: 1,
      songs: safeSongs,
      reactions: {},
    };

    if (authCtx.bearerToken) {
      await commitFirestoreDocument(env, `posts/${postId}`, postDoc, {
        isCreate: true,
        bearerToken: authCtx.bearerToken,
      });
    } else {
      return jsonResponse(
        {
          success: false,
          error:
            'Cloudflare post requires Google Sign-In (Firebase Auth) or FIREBASE_SERVICE_ACCOUNT_JSON configured in Cloudflare Pages environment variables.',
        },
        401
      );
    }

    return jsonResponse(
      {
        ...postDoc,
        createdAt: nowIso,
        updatedAt: nowIso,
        comments: [],
      },
      201
    );
  } catch (err) {
    return jsonResponse(
      { success: false, error: err?.message || 'Failed to create post via Cloudflare' },
      500
    );
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: `Method ${method} Not Allowed` }, 405);
}
