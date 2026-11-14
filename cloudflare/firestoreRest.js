/**
 * Firestore REST API Helper for Cloudflare Pages Functions
 * Connects Cloudflare Pages serverless endpoints directly to Firebase Cloud Firestore.
 */

export const FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0542058630',
  databaseId: 'ai-studio-thedailychronicl-e1439854-677f-4a3b-ac0b-72dce2ec6d7f',
};

export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-Token',
};

export function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

export function sanitizeId(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function getFirestoreBaseUrl(env) {
  const projectId = env?.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId;
  const databaseId = env?.FIREBASE_DATABASE_ID || FIREBASE_CONFIG.databaseId;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}`;
}

export function getDocumentResourcePrefix(env) {
  const projectId = env?.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId;
  const databaseId = env?.FIREBASE_DATABASE_ID || FIREBASE_CONFIG.databaseId;
  return `projects/${projectId}/databases/${databaseId}/documents`;
}

/**
 * Convert JS value -> Firestore REST Value
 */
export function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

/**
 * Convert Firestore REST Value -> JS value
 */
export function fromFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values || [];
    return values.map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const out = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

export function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = fromFirestoreValue(v);
  }
  if (!out.id && doc.name) {
    out.id = doc.name.split('/').pop();
  }
  return out;
}

/**
 * Extract Firebase UID from a JWT payload without external deps (Firestore validates signature)
 */
export function decodeJwtPayload(jwt) {
  try {
    if (!jwt || typeof jwt !== 'string') return null;
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function base64UrlEncode(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem) {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Mint an OAuth2 Access Token from optional Cloudflare env service account secret
 */
async function getServiceAccountAccessToken(env) {
  try {
    let clientEmail = env?.FIREBASE_CLIENT_EMAIL;
    let privateKey = env?.FIREBASE_PRIVATE_KEY;

    if (env?.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      clientEmail = sa.client_email;
      privateKey = sa.private_key;
    }

    if (!clientEmail || !privateKey) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    );

    const key = await importPrivateKey(privateKey);
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${payload}`)
    );

    const assertion = `${header}.${payload}.${base64UrlEncode(sig)}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}`,
    });

    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    return tokenData.access_token || null;
  } catch (err) {
    console.warn('Service account token mint warning:', err);
    return null;
  }
}

/**
 * Resolve auth token for Firestore REST API (Service Account OR user's Firebase ID Token)
 */
export async function resolveFirestoreAuth(request, env) {
  const fbHeaderToken = request.headers.get('X-Firebase-Token')?.trim();
  const authHeader = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();

  const candidateIdToken =
    (fbHeaderToken && fbHeaderToken.split('.').length === 3 && fbHeaderToken) ||
    (authHeader && authHeader.split('.').length === 3 && authHeader) ||
    null;

  const idClaims = candidateIdToken ? decodeJwtPayload(candidateIdToken) : null;
  const serviceAccessToken = await getServiceAccountAccessToken(env);

  return {
    bearerToken: serviceAccessToken || candidateIdToken,
    idToken: candidateIdToken,
    uid: idClaims?.user_id || idClaims?.sub || null,
    email: idClaims?.email || null,
    emailVerified: Boolean(idClaims?.email_verified),
    appToken: authHeader || null,
  };
}

/**
 * Run a structured query on Firestore REST API
 */
export async function queryFirestoreCollection(
  env,
  collectionId,
  whereFilter = null,
  bearerToken = null,
  parentPath = ''
) {
  const baseUrl = getFirestoreBaseUrl(env);
  const cleanParent = String(parentPath || '').replace(/^\/+|\/+$/g, '');
  const queryUrl = cleanParent
    ? `${baseUrl}/documents/${cleanParent}:runQuery`
    : `${baseUrl}/documents:runQuery`;

  const structuredQuery = {
    from: [{ collectionId }],
    limit: 100,
  };

  if (whereFilter) {
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: whereFilter.field },
        op: whereFilter.op || 'EQUAL',
        value: toFirestoreValue(whereFilter.value),
      },
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetch(queryUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore runQuery failed (${res.status}): ${errText}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r.document)
    .map((r) => fromFirestoreDoc(r.document))
    .filter(Boolean);
}

/**
 * Get a single document from Firestore REST API
 */
export async function getFirestoreDocument(env, docPath, bearerToken = null) {
  const baseUrl = getFirestoreBaseUrl(env);
  const headers = {};
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetch(`${baseUrl}/documents/${docPath}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore get failed (${res.status}): ${errText}`);
  }
  const doc = await res.json();
  return fromFirestoreDoc(doc);
}

/**
 * Commit a write to Firestore with optional server REQUEST_TIME timestamps
 */
export async function commitFirestoreDocument(
  env,
  docPath,
  data,
  {
    isCreate = false,
    includeCreatedAt = isCreate,
    includeUpdatedAt = true,
    bearerToken = null,
    updateMaskPaths = null,
  } = {}
) {
  const baseUrl = getFirestoreBaseUrl(env);
  const docName = `${getDocumentResourcePrefix(env)}/${docPath}`;

  const fieldTransforms = [];
  if (includeUpdatedAt) {
    fieldTransforms.push({ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' });
  }
  if (includeCreatedAt) {
    fieldTransforms.push({ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' });
  }

  const writeObj = {
    update: {
      name: docName,
      fields: toFirestoreFields(data),
    },
  };

  if (fieldTransforms.length > 0) {
    writeObj.updateTransforms = fieldTransforms;
  }

  if (Array.isArray(updateMaskPaths) && updateMaskPaths.length > 0) {
    writeObj.updateMask = { fieldPaths: updateMaskPaths };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetch(`${baseUrl}/documents:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes: [writeObj] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Delete a document from Firestore REST API
 */
export async function deleteFirestoreDocument(env, docPath, bearerToken = null) {
  const baseUrl = getFirestoreBaseUrl(env);
  const headers = {};
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetch(`${baseUrl}/documents/${docPath}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Firestore delete failed (${res.status}): ${errText}`);
  }
  return true;
}
