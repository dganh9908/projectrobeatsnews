import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  getFirestoreDocument,
} from '../../../cloudflare/firestoreRest.js';

const ADMIN_PERMISSIONS = {
  canPublishNews: true,
  canEditAllNews: true,
  canManageSongs: true,
  canManageUsers: true,
  canManageWebhooks: true,
  canManageRanks: true,
  canDeleteContent: true,
  canChangePasswords: true,
  canEditProfiles: true,
  canManageRoles: true,
  canAccessAdminPanel: true,
};

const PLAYER_PERMISSIONS = {
  canPublishNews: false,
  canEditAllNews: false,
  canManageSongs: false,
  canManageUsers: false,
  canManageWebhooks: false,
  canManageRanks: false,
  canDeleteContent: false,
  canChangePasswords: false,
  canEditProfiles: false,
  canManageRoles: false,
  canAccessAdminPanel: false,
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const authCtx = await resolveFirestoreAuth(request, env);

    // 1. Firebase Authenticated User
    if (authCtx.uid) {
      const uid = sanitizeId(authCtx.uid);
      const isBootstrapAdmin = String(authCtx.email || '').toLowerCase() === 'chautuan9461@gmail.com';
      let userDoc = null;
      if (authCtx.bearerToken) {
        userDoc = await getFirestoreDocument(env, `users/${uid}`, authCtx.bearerToken).catch(() => null);
      }
      const role = isBootstrapAdmin ? 'admin' : (userDoc?.role || 'player');
      const isAdminRole = role === 'admin' || role === 'robeatsdev';
      return jsonResponse(
        {
          user: {
            id: uid,
            username: userDoc?.username || (authCtx.email ? authCtx.email.split('@')[0] : 'player'),
            displayName: userDoc?.displayName || 'Player',
            email: authCtx.email || undefined,
            avatar: userDoc?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            bio: userDoc?.bio || 'RoBeats rhythm player',
            roBeatsRank: userDoc?.roBeatsRank || 'Beginner',
            preferredNoteSpeed: userDoc?.preferredNoteSpeed || '1.8x',
            role,
            permissions: isAdminRole ? ADMIN_PERMISSIONS : PLAYER_PERMISSIONS,
            createdAt: userDoc?.createdAt || new Date().toISOString(),
          },
        },
        200
      );
    }

    // 2. Local app token format: tok_<userId>_<timestamp>
    if (authCtx.appToken) {
      const match = authCtx.appToken.match(/^tok_(.+)_\d+$/);
      if (match) {
        const userId = sanitizeId(match[1]);
        if (userId === 'usr_admin_meelo') {
          return jsonResponse(
            {
              user: {
                id: 'usr_admin_meelo',
                username: 'meelo',
                displayName: 'Meelo',
                avatar: 'https://down-vn.img.susercontent.com/file/sg-11134201-81zwv-mih44jns7q4n42',
                bio: 'Administrator & Founder of RoBeats News',
                roBeatsRank: 'Star',
                preferredNoteSpeed: '2.0x',
                role: 'admin',
                permissions: ADMIN_PERMISSIONS,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            },
            200
          );
        }

        if (authCtx.bearerToken) {
          const userDoc = await getFirestoreDocument(env, `users/${userId}`, authCtx.bearerToken).catch(() => null);
          if (userDoc) {
            const isAdminRole = userDoc.role === 'admin' || userDoc.role === 'robeatsdev';
            return jsonResponse(
              {
                user: {
                  ...userDoc,
                  permissions: isAdminRole ? ADMIN_PERMISSIONS : PLAYER_PERMISSIONS,
                },
              },
              200
            );
          }
        }
      }
    }

    return jsonResponse({ error: 'Not authenticated' }, 401);
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
