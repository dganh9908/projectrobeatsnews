import {
  CORS_HEADERS,
  jsonResponse,
} from '../../../cloudflare/firestoreRest.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost() {
  return jsonResponse(
    {
      success: false,
      error: 'Account creation is disabled. Please sign in with Google.',
    },
    403
  );
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'POST') return onRequestPost();
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: `Method ${method} Not Allowed` }, 405);
}
