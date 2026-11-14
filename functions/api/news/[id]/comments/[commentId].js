import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  deleteFirestoreDocument,
} from '../../../../../cloudflare/firestoreRest.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestDelete(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const commentId = sanitizeId(params.commentId);
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.bearerToken) {
      return jsonResponse(
        { success: false, error: 'Authentication required to delete comments.' },
        401
      );
    }

    await deleteFirestoreDocument(
      env,
      `posts/${postId}/comments/${commentId}`,
      authCtx.bearerToken
    );

    return jsonResponse({ success: true, id: commentId }, 200);
  } catch (err) {
    return jsonResponse(
      { success: false, error: err?.message || 'Failed to delete comment' },
      500
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  if (context.request.method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
}
