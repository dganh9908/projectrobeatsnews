import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  getFirestoreDocument,
  commitFirestoreDocument,
  deleteFirestoreDocument,
} from '../../../cloudflare/firestoreRest.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const authCtx = await resolveFirestoreAuth(request, env);
    const doc = await getFirestoreDocument(env, `posts/${postId}`, authCtx.bearerToken);
    if (!doc) {
      return jsonResponse({ success: false, error: 'Post not found' }, 404);
    }
    return jsonResponse(doc, 200);
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to get post' }, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.bearerToken) {
      return jsonResponse(
        { success: false, error: 'Firebase authentication required to update post via Cloudflare.' },
        401
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON request body' }, 400);
    }

    const existing = await getFirestoreDocument(env, `posts/${postId}`, authCtx.bearerToken);
    if (!existing) {
      return jsonResponse({ success: false, error: 'Post not found in Firestore' }, 404);
    }

    const updateData = {};
    const maskPaths = ['updatedAt'];

    if (body.title !== undefined) {
      updateData.title = String(body.title).trim().slice(0, 200);
      maskPaths.push('title');
    }
    if (body.subtitle !== undefined) {
      updateData.subtitle = String(body.subtitle).trim().slice(0, 300);
      maskPaths.push('subtitle');
    }
    if (body.content !== undefined) {
      updateData.content = String(body.content).trim().slice(0, 20000);
      maskPaths.push('content');
    }
    if (body.category !== undefined) {
      updateData.category = String(body.category).trim().slice(0, 64);
      maskPaths.push('category');
    }
    if (body.coverImage !== undefined) {
      updateData.coverImage = String(body.coverImage || '').trim().slice(0, 2048);
      maskPaths.push('coverImage');
    }
    if (Array.isArray(body.songs)) {
      updateData.songs = body.songs.slice(0, 20);
      maskPaths.push('songs');
    }
    if (Array.isArray(body.tags)) {
      updateData.tags = body.tags.filter((t) => typeof t === 'string').slice(0, 15);
      maskPaths.push('tags');
    }
    if (body.missionRank !== undefined) {
      updateData.missionRank = String(body.missionRank || '').slice(0, 32);
      maskPaths.push('missionRank');
    }

    await commitFirestoreDocument(env, `posts/${postId}`, updateData, {
      isCreate: false,
      bearerToken: authCtx.bearerToken,
      updateMaskPaths: maskPaths,
    });

    return jsonResponse(
      {
        ...existing,
        ...updateData,
        updatedAt: new Date().toISOString(),
      },
      200
    );
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to update post' }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.bearerToken) {
      return jsonResponse(
        { success: false, error: 'Firebase authentication required to delete post via Cloudflare.' },
        401
      );
    }

    await deleteFirestoreDocument(env, `posts/${postId}`, authCtx.bearerToken);
    return jsonResponse({ success: true, id: postId }, 200);
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to delete post' }, 500);
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'PUT') return onRequestPut(context);
  if (method === 'DELETE') return onRequestDelete(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: `Method ${method} Not Allowed` }, 405);
}
