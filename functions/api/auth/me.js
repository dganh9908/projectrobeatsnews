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

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);

    if (!authCtx.uid) {
      return jsonResponse({ error: 'Not authenticated. Please sign in with Google.' }, 401);
    }

    const uid = sanitizeId(authCtx.uid);
    const claims = authCtx.idToken ? decodeJwtPayload(authCtx.idToken) : null;
    const email = String(authCtx.email || claims?.email || '').trim().toLowerCase();
    const isBootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS.includes(email) && authCtx.emailVerified;

    let userDoc = null;
    if (authCtx.bearerToken) {
      userDoc = await getFirestoreDocument(env, `users/${uid}`, authCtx.bearerToken).catch(() => null);
    }

    const role = isBootstrapAdmin ? 'admin' : (userDoc?.role || 'player');

    return jsonResponse(
      {
        user: {
          id: uid,
          username: userDoc?.username || (email ? email.split('@')[0] : 'player'),
          displayName: userDoc?.displayName || claims?.name || 'Player',
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
        },
      },
      200
    );
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Session check failed' }, 500);
  }
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return onRequestGet(context);
  if (method === 'OPTIONS') return onRequestOptions();
  return jsonResponse({ error: `Method ${method} Not Allowed` }, 405);
}
