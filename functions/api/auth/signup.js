import {
  CORS_HEADERS,
  jsonResponse,
  sanitizeId,
  resolveFirestoreAuth,
  commitFirestoreDocument,
} from '../../../cloudflare/firestoreRest.js';

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

    const username = String(body.username || '').trim().replace(/^@/, '').toLowerCase();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!username || !email || !password) {
      return jsonResponse(
        { success: false, error: 'Username, email, and password are required.' },
        400
      );
    }

    if (username.length < 3) {
      return jsonResponse(
        { success: false, error: 'Username must be at least 3 characters long.' },
        400
      );
    }

    if (password.length < 6) {
      return jsonResponse(
        { success: false, error: 'Password must be at least 6 characters long.' },
        400
      );
    }

    const authCtx = await resolveFirestoreAuth(request, env);
    const uid = sanitizeId(authCtx.uid || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

    const newUserPublic = {
      id: uid,
      username: username.slice(0, 64),
      displayName: String(body.displayName || username).trim().slice(0, 80),
      avatar: String(
        body.avatar ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
      ).slice(0, 2048),
      bio: String(body.bio || 'RoBeats rhythm player').slice(0, 500),
      roBeatsRank: String(body.roBeatsRank || 'Beginner').slice(0, 40),
      preferredNoteSpeed: String(body.preferredNoteSpeed || '1.8x').slice(0, 20),
      role: 'player',
      currentStreak: 1,
      bestStreak: 1,
      unlockedFrames: [],
    };

    if (authCtx.bearerToken) {
      try {
        await commitFirestoreDocument(env, `users/${uid}`, newUserPublic, {
          isCreate: true,
          bearerToken: authCtx.bearerToken,
        });
        await commitFirestoreDocument(
          env,
          `users/${uid}/private/info`,
          { uid, email },
          {
            isCreate: false,
            includeCreatedAt: false,
            includeUpdatedAt: true,
            bearerToken: authCtx.bearerToken,
          }
        );
      } catch (fsErr) {
        console.warn('[Cloudflare /api/auth/signup] Firestore write warning:', fsErr.message);
      }
    }

    const userResponse = {
      ...newUserPublic,
      email,
      permissions: PLAYER_PERMISSIONS,
      createdAt: new Date().toISOString(),
    };

    return jsonResponse(
      {
        success: true,
        user: userResponse,
        token: `tok_${uid}_${Date.now()}`,
      },
      201
    );
  } catch (err) {
    return jsonResponse(
      { success: false, error: err?.message || 'Signup failed' },
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
