import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  queryFirestoreCollection,
  commitFirestoreDocument,
} from '../../../../cloudflare/firestoreRest.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const authCtx = await resolveFirestoreAuth(request, env);

    const comments = await queryFirestoreCollection(
      env,
      'comments',
      { field: 'postId', op: 'EQUAL', value: postId },
      authCtx.bearerToken,
      `posts/${postId}`
    );

    return jsonResponse(comments || [], 200);
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to load comments' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { params, request, env } = context;
    const postId = sanitizeId(params.id);
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.bearerToken || !authCtx.uid) {
      return jsonResponse(
        { success: false, error: 'Please sign in with Google to comment on Firestore posts.' },
        401
      );
    }

    const body = await request.json();
    const content = String(body.content || '').trim().slice(0, 1000);
    if (!content) {
      return jsonResponse({ success: false, error: 'Comment content is required' }, 400);
    }

    const commentId = sanitizeId(`comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const commentDoc = {
      id: commentId,
      postId,
      authorUid: sanitizeId(authCtx.uid),
      authorName: String(body.authorName || authCtx.email?.split('@')[0] || 'Player').slice(0, 80),
      authorAvatar: String(body.authorAvatar || '').slice(0, 2048),
      authorRole: String(body.authorRole || 'player').slice(0, 32),
      content,
    };

    await commitFirestoreDocument(env, `posts/${postId}/comments/${commentId}`, commentDoc, {
      isCreate: true,
      includeCreatedAt: true,
      includeUpdatedAt: false,
      bearerToken: authCtx.bearerToken,
    });

    return jsonResponse({ ...commentDoc, createdAt: new Date().toISOString() }, 201);
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to post comment' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
}
