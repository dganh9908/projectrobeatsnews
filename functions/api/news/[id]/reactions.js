import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  getFirestoreDocument,
  commitFirestoreDocument,
} from '../../../../cloudflare/firestoreRest.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const { emoji } = await request.json();

    if (!emoji || typeof emoji !== 'string') {
      return jsonResponse({ success: false, error: 'Emoji is required' }, 400);
    }

    const authCtx = await resolveFirestoreAuth(request, env);
    const post = await getFirestoreDocument(env, `posts/${postId}`, authCtx.bearerToken);
    if (!post) {
      return jsonResponse({ success: false, error: 'Post not found' }, 404);
    }

    const reactions = { ...(post.reactions || {}) };
    reactions[emoji] = (reactions[emoji] || 0) + 1;

    if (authCtx.bearerToken) {
      await commitFirestoreDocument(
        env,
        `posts/${postId}`,
        { reactions },
        { isCreate: false, bearerToken: authCtx.bearerToken, updateMaskPaths: ['reactions', 'updatedAt'] }
      );
    }

    return jsonResponse({ success: true, reactions }, 200);
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to update reactions' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
}
