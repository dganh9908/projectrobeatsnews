import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  getFirestoreDocument,
  decodeJwtPayload,
} from '../../../cloudflare/firestoreRest.js';

const BOOTSTRAP_ADMIN_EMAILS = ['chautuan9461@gmail.com', 'anh6052018@gmail.com'];

const ADMIN_PERMISSIONS = {
  canPublishNews: true,
  canEditAllNews: true,
  canManageSongs: true,
  canManageUsers: true,
  canManageWebhooks: true,
  canManageRanks: true,
  canDeleteContent: true,
  canEditProfiles: true,
  canManageRoles: true,
  canAccessAdminPanel: true,
};

const STAFF_PERMISSIONS = {
  canPublishNews: true,
  canEditAllNews: false,
  canManageSongs: false,
  canManageUsers: false,
  canManageWebhooks: false,
  canManageRanks: false,
  canDeleteContent: false,
  canEditProfiles: false,
  canManageRoles: false,
  canAccessAdminPanel: false,
};

const PLAYER_PERMISSIONS = {
  canPublishNews: false,
  canEditAllNews: false,
  canManageSongs: false,
  canManageUsers: false,
  canManageWebhooks: false,
  canManageRanks: false,
  canDeleteContent: false,
  canEditProfiles: false,
  canManageRoles: false,
  canAccessAdminPanel: false,
};

function getPermissionsForRole(role) {
  if (role === 'admin') return ADMIN_PERMISSIONS;
  if (role === 'staff') return STAFF_PERMISSIONS;
  return PLAYER_PERMISSIONS;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    let body = {};
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON request body.' }, 400);
    }

    const authCtx = await resolveFirestoreAuth(request, env);
    const bodyToken = typeof body.firebaseToken === 'string' ? body.firebaseToken.trim() : null;
    const rawJwt = authCtx.idToken || (bodyToken && bodyToken.split('.').length === 3 ? bodyToken : null);
    const claims = rawJwt ? decodeJwtPayload(rawJwt) : null;
    const uid = claims?.user_id || claims?.sub || authCtx.uid;

    if (!uid) {
      return jsonResponse(
        {
          success: false,
          error: 'Password login is disabled. Please sign in with Google.',
        },
        403
      );
    }

    const safeUid = sanitizeId(uid);
    const email = String(claims?.email || authCtx.email || '').trim().toLowerCase();
    const emailVerified = Boolean(claims?.email_verified ?? authCtx.emailVerified);
    const isBootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS.includes(email) && emailVerified;

    let userDoc = null;
    const bearer = authCtx.bearerToken || rawJwt;
    if (bearer) {
      userDoc = await getFirestoreDocument(env, `users/${safeUid}`, bearer).catch(() => null);
    }

    const role = isBootstrapAdmin ? 'admin' : (userDoc?.role || 'player');
    const userObj = {
      id: safeUid,
      username: userDoc?.username || (email ? email.split('@')[0] : safeUid),
      displayName: userDoc?.displayName || claims?.name || (email ? email.split('@')[0] : 'Player'),
      email: email || undefined,
      avatar:
        userDoc?.avatar ||
        claims?.picture ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      bio: userDoc?.bio || 'RoBeats rhythm player',
      roBeatsRank: userDoc?.roBeatsRank || 'Beginner',
      preferredNoteSpeed: userDoc?.preferredNoteSpeed || '1.8x',
      role,
      permissions: getPermissionsForRole(role),
      createdAt: userDoc?.createdAt || new Date().toISOString(),
    };

    return jsonResponse(
      {
        success: true,
        user: userObj,
        token: rawJwt,
      },
      200
    );
  } catch (err) {
    return jsonResponse(
      { success: false, error: err?.message || 'Authentication failed' },
      500
    );
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'POST') return onRequestPost(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ success: false, error: `Method ${method} Not Allowed` }, 405);
}
