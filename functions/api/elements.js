import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  queryFirestoreCollection,
  commitFirestoreDocument,
} from '../../cloudflare/firestoreRest.js';

const ELEMENT_BASE_COLORS = {
  Rush: { color: 'Red', hex: '#EF4444' },
  Flow: { color: 'Purple', hex: '#A855F7' },
  Beat: { color: 'Orange', hex: '#F97316' },
  Vibe: { color: 'Green', hex: '#22C55E' },
  Chill: { color: 'Blue', hex: '#3B82F6' },
  Standard: { color: 'Cyan', hex: '#06B6D4' },
};

const ALL_ELEMENT_NAMES = [
  'Rush', 'Flow', 'Beat', 'Vibe', 'Chill',
  'Rush/Flow', 'Rush/Vibe', 'Rush/Chill', 'Rush/Beat',
  'Flow/Rush', 'Flow/Vibe', 'Flow/Chill', 'Flow/Beat',
  'Vibe/Rush', 'Vibe/Flow', 'Vibe/Chill', 'Vibe/Beat',
  'Chill/Flow', 'Chill/Vibe', 'Chill/Beat', 'Chill/Rush',
  'Beat/Vibe', 'Beat/Rush', 'Beat/Chill', 'Beat/Flow',
];

function createDefaultElementSvg(name, primaryHex, secondaryHex) {
  const isCombo = Boolean(secondaryHex && secondaryHex !== primaryHex);
  const gradId = `grad_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${primaryHex}" /><stop offset="100%" stop-color="${isCombo ? secondaryHex : primaryHex}" /></linearGradient></defs><rect width="48" height="48" rx="12" fill="#0C1017" stroke="${primaryHex}" stroke-opacity="0.4" stroke-width="2"/><polygon points="24,7 39,24 24,41 9,24" fill="url(#${gradId})" opacity="0.9"/><circle cx="24" cy="24" r="5" fill="#FFFFFF" opacity="0.95"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildDefaultElements() {
  return ALL_ELEMENT_NAMES.map((name) => {
    const [primary, secondary] = name.split('/');
    const primInfo = ELEMENT_BASE_COLORS[primary] || ELEMENT_BASE_COLORS.Standard;
    const secInfo = secondary ? (ELEMENT_BASE_COLORS[secondary] || ELEMENT_BASE_COLORS.Standard) : undefined;
    return {
      id: sanitizeId(name.toLowerCase()),
      name,
      color: secInfo ? `${primInfo.color} / ${secInfo.color}` : primInfo.color,
      hexColor: primInfo.hex,
      ...(secInfo ? { secondaryHexColor: secInfo.hex } : {}),
      imageUrl: createDefaultElementSvg(name, primInfo.hex, secInfo?.hex),
    };
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);
    let elements = [];

    try {
      elements = await queryFirestoreCollection(env, 'elements', null, authCtx.bearerToken);
    } catch (fsErr) {
      console.warn('[Cloudflare /api/elements GET] Firestore query error:', fsErr.message);
    }

    if (!Array.isArray(elements) || elements.length === 0) {
      elements = buildDefaultElements();
    }

    return jsonResponse(elements, 200);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Failed to read elements' }, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);
    if (!authCtx.bearerToken) {
      return jsonResponse({ error: 'Admin Firebase authentication required.' }, 401);
    }

    const raw = await request.json();
    const elements = Array.isArray(raw) ? raw : raw?.elements;
    if (!Array.isArray(elements) || elements.length === 0) {
      return jsonResponse({ error: 'Expected array of element configs' }, 400);
    }

    for (const el of elements) {
      const elementId = sanitizeId(el.id || el.name);
      await commitFirestoreDocument(
        env,
        `elements/${elementId}`,
        {
          id: elementId,
          name: String(el.name || elementId).slice(0, 64),
          color: String(el.color || 'Cyan').slice(0, 64),
          ...(el.hexColor ? { hexColor: String(el.hexColor).slice(0, 32) } : {}),
          ...(el.secondaryHexColor ? { secondaryHexColor: String(el.secondaryHexColor).slice(0, 32) } : {}),
          ...(el.imageUrl ? { imageUrl: String(el.imageUrl).slice(0, 2048) } : {}),
        },
        {
          isCreate: false,
          includeCreatedAt: false,
          includeUpdatedAt: false,
          bearerToken: authCtx.bearerToken,
        }
      );
    }

    return jsonResponse({ success: true, elements }, 200);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Failed to update elements' }, 500);
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'PUT') return onRequestPut(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ error: `Method ${method} Not Allowed` }, 405);
}
