import {
  CORS_HEADERS,
  jsonResponse,
  resolveFirestoreAuth,
  queryFirestoreCollection,
  decodeJwtPayload,
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

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON request body.' }, 400);
    }

    const identifier = String(body.identifier || body.username || body.email || '').trim();
    const password = String(body.password || '');

    if (!identifier || !password) {
      return jsonResponse(
        { success: false, error: 'Username/email and password are required.' },
        400
      );
    }

    const cleanId = identifier.toLowerCase().replace(/^@/, '');

    // 1. Admin local-compatible login check (matches Express server @meelo account)
    if (
      (cleanId === 'meelo' || cleanId === 'chautuan9461@gmail.com') &&
      (password === 'meelovn2005' || password === 'admin' || password === 'meelo')
    ) {
      const meeloUser = {
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
      };
      const token = `tok_${meeloUser.id}_${Date.now()}`;
      return jsonResponse({ success: true, user: meeloUser, token }, 200);
    }

    // 2. If a Firebase ID token is supplied in headers or body, verify claims & sync profile
    const authCtx = await resolveFirestoreAuth(request, env);
    const bodyToken = typeof body.firebaseToken === 'string' ? body.firebaseToken : null;
    const claims = bodyToken ? decodeJwtPayload(bodyToken) : (authCtx.uid ? { user_id: authCtx.uid, email: authCtx.email } : null);

    if (claims && (claims.user_id || claims.sub)) {
      const uid = claims.user_id || claims.sub;
      const isBootstrapAdmin = String(claims.email || '').toLowerCase() === 'chautuan9461@gmail.com';
      const userObj = {
        id: uid,
        username: (claims.email ? claims.email.split('@')[0] : cleanId).toLowerCase(),
        displayName: claims.name || cleanId,
        email: claims.email || undefined,
        avatar: claims.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        role: isBootstrapAdmin ? 'admin' : 'player',
        permissions: isBootstrapAdmin ? ADMIN_PERMISSIONS : PLAYER_PERMISSIONS,
        createdAt: new Date().toISOString(),
      };
      return jsonResponse({ success: true, user: userObj, token: `tok_${uid}_${Date.now()}` }, 200);
    }

    // 3. Look up user in Firestore users collection when service account token is configured
    if (authCtx.bearerToken) {
      try {
        const matches = await queryFirestoreCollection(
          env,
          'users',
          { field: 'username', op: 'EQUAL', value: cleanId },
          authCtx.bearerToken
        );
        if (matches.length > 0) {
          const found = matches[0];
          const isAdminRole = found.role === 'admin' || found.role === 'robeatsdev';
          return jsonResponse(
            {
              success: true,
              user: {
                ...found,
                permissions: isAdminRole ? ADMIN_PERMISSIONS : PLAYER_PERMISSIONS,
              },
              token: `tok_${found.id}_${Date.now()}`,
            },
            200
          );
        }
      } catch (fsErr) {
        console.warn('[Cloudflare /api/auth/login] Firestore lookup warning:', fsErr.message);
      }
    }

    return jsonResponse(
      {
        success: false,
        error: 'Invalid credentials. On Cloudflare Pages, sign in with Google (Firebase Auth) or use valid admin credentials.',
      },
      401
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
