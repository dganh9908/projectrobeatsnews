import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { NewsArticle, SongEntry, User, UserPermissions, UserRole, Comment } from '../types';

export const BOOTSTRAP_ADMIN_EMAIL = 'chautuan9461@gmail.com';

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || `doc_${Date.now()}`;
}

export async function getFirebaseIdToken(): Promise<string | null> {
  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('Could not get Firebase ID token', err);
  }
  return null;
}

function normalizeTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function mapDocToArticle(docId: string, data: any): NewsArticle {
  return {
    id: String(data.id || docId),
    title: String(data.title || 'Untitled'),
    subtitle: data.subtitle || '',
    content: data.content || '',
    summary: data.summary || '',
    category: data.category || 'Daily mission',
    author: data.author && typeof data.author === 'object'
      ? data.author
      : { name: 'Staff', role: 'Staff', avatar: '' },
    publishedAt: normalizeTimestamp(data.publishedAt || data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt || data.createdAt),
    readTime: data.readTime || '1 min read',
    coverImage: data.coverImage || undefined,
    coverImageCaption: data.coverImageCaption || '',
    isBreaking: Boolean(data.isBreaking),
    isFeatured: Boolean(data.isFeatured),
    isTrending: Boolean(data.isTrending),
    missionRank: data.missionRank || undefined,
    status: data.status || 'published',
    tags: Array.isArray(data.tags) ? data.tags : [],
    views: typeof data.views === 'number' ? data.views : 1,
    songs: Array.isArray(data.songs) ? data.songs : [],
    reactions: data.reactions && typeof data.reactions === 'object' ? data.reactions : {},
    comments: Array.isArray(data.comments) ? data.comments : [],
    authorUid: data.authorUid,
  };
}

function buildSafePostPayload(article: Partial<NewsArticle>, postId: string, authorUid: string, isCreate: boolean) {
  const safeTags = Array.isArray(article.tags)
    ? article.tags.filter((t): t is string => typeof t === 'string').slice(0, 15)
    : [];
  const safeSongs = Array.isArray(article.songs) ? article.songs.slice(0, 20) : [];

  const base: Record<string, any> = {
    title: String(article.title || 'RoBeats News').slice(0, 200),
    category: String(article.category || 'Daily mission').slice(0, 64),
    status: article.status === 'draft' ? 'draft' : 'published',
    updatedAt: serverTimestamp(),
  };

  if (article.subtitle !== undefined) base.subtitle = String(article.subtitle).slice(0, 300);
  if (article.content !== undefined) base.content = String(article.content).slice(0, 20000);
  if (article.summary !== undefined) base.summary = String(article.summary).slice(0, 500);
  if (article.author !== undefined && typeof article.author === 'object') base.author = article.author;
  if (article.publishedAt !== undefined) base.publishedAt = String(article.publishedAt).slice(0, 64);
  if (article.readTime !== undefined) base.readTime = String(article.readTime).slice(0, 32);
  if (article.coverImage) base.coverImage = String(article.coverImage).slice(0, 2048);
  if (article.coverImageCaption !== undefined) base.coverImageCaption = String(article.coverImageCaption).slice(0, 300);
  if (article.isBreaking !== undefined) base.isBreaking = Boolean(article.isBreaking);
  if (article.isFeatured !== undefined) base.isFeatured = Boolean(article.isFeatured);
  if (article.isTrending !== undefined) base.isTrending = Boolean(article.isTrending);
  if (article.missionRank) base.missionRank = String(article.missionRank).slice(0, 32);
  if (article.views !== undefined) base.views = Math.max(0, Number(article.views) || 0);
  if (article.tags !== undefined) base.tags = safeTags;
  if (article.songs !== undefined) base.songs = safeSongs;
  if (article.reactions !== undefined && typeof article.reactions === 'object') base.reactions = article.reactions;

  if (isCreate) {
    base.id = postId;
    base.authorUid = authorUid;
    base.createdAt = serverTimestamp();
    if (!base.publishedAt) base.publishedAt = new Date().toISOString();
    if (!base.reactions) base.reactions = {};
  }

  return base;
}

export async function fetchPostsFromFirestore(): Promise<NewsArticle[]> {
  const path = 'posts';
  try {
    const q = query(collection(db, path), where('status', '==', 'published'));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => mapDocToArticle(d.id, d.data()));
    items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeToPublishedPosts(
  onData: (posts: NewsArticle[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = 'posts';
  const q = query(collection(db, path), where('status', '==', 'published'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapDocToArticle(d.id, d.data()));
      items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped: any) {
        if (onError) onError(wrapped);
      }
    }
  );
}

export async function createPostInFirestore(article: NewsArticle): Promise<NewsArticle> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Firebase authentication required to write directly to Firestore.');
  }
  const postId = sanitizeFirestoreId(article.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `posts/${postId}`;
  const payload = buildSafePostPayload(article, postId, currentUser.uid, true);

  try {
    await setDoc(doc(db, 'posts', postId), payload);
    return {
      ...article,
      id: postId,
      authorUid: currentUser.uid,
      publishedAt: payload.publishedAt,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updatePostInFirestore(postId: string, updates: Partial<NewsArticle>): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;
  const payload = buildSafePostPayload(updates, safeId, currentUser.uid, false);

  try {
    await updateDoc(doc(db, 'posts', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePostInFirestore(postId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;

  try {
    await deleteDoc(doc(db, 'posts', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function togglePostReactionInFirestore(postId: string, reactions: Record<string, number>): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const safeId = sanitizeFirestoreId(postId);
  const path = `posts/${safeId}`;

  try {
    await updateDoc(doc(db, 'posts', safeId), {
      reactions,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchCommentsFromFirestore(postId: string): Promise<Comment[]> {
  const safePostId = sanitizeFirestoreId(postId);
  const path = `posts/${safePostId}/comments`;
  try {
    const q = query(collection(db, 'posts', safePostId, 'comments'), where('postId', '==', safePostId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: String(data.id || d.id),
        postId: String(data.postId || safePostId),
        userId: data.authorUid,
        authorName: String(data.authorName || 'Player'),
        authorAvatar: data.authorAvatar || '',
        authorRole: data.authorRole || 'player',
        content: String(data.content || ''),
        createdAt: normalizeTimestamp(data.createdAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function addCommentInFirestore(postId: string, content: string, authorName: string, authorAvatar?: string, authorRole?: string): Promise<Comment> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sign in with Google to post comments directly to Firestore.');
  }
  const safePostId = sanitizeFirestoreId(postId);
  const commentId = sanitizeFirestoreId(`comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `posts/${safePostId}/comments/${commentId}`;

  try {
    await setDoc(doc(db, 'posts', safePostId, 'comments', commentId), {
      id: commentId,
      postId: safePostId,
      authorUid: currentUser.uid,
      authorName: String(authorName || currentUser.displayName || 'Player').slice(0, 80),
      authorAvatar: String(authorAvatar || currentUser.photoURL || '').slice(0, 2048),
      authorRole: String(authorRole || 'player').slice(0, 32),
      content: String(content).trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    return {
      id: commentId,
      postId: safePostId,
      userId: currentUser.uid,
      authorName: String(authorName || currentUser.displayName || 'Player'),
      authorAvatar: authorAvatar || currentUser.photoURL || '',
      authorRole: authorRole || 'player',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteCommentInFirestore(postId: string, commentId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const safePostId = sanitizeFirestoreId(postId);
  const safeCommentId = sanitizeFirestoreId(commentId);
  const path = `posts/${safePostId}/comments/${safeCommentId}`;

  try {
    await deleteDoc(doc(db, 'posts', safePostId, 'comments', safeCommentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchSongsFromFirestore(): Promise<SongEntry[]> {
  const path = 'songs';
  try {
    const q = query(collection(db, path), where('id', '!=', ''));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SongEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function resolveUserRoleFromFirestore(firebaseUser: FirebaseUser): Promise<UserRole> {
  if (firebaseUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && firebaseUser.emailVerified) {
    return 'admin';
  }
  try {
    const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
    if (adminDoc.exists()) {
      const role = adminDoc.data()?.role;
      if (role === 'admin' || role === 'staff') return role;
    }
  } catch (err) {
    console.warn('Could not read admin role document', err);
  }
  return 'player';
}

export function getPermissionsForRole(role: UserRole): UserPermissions {
  if (role === 'admin' || role === 'robeatsdev') {
    return {
      canManageUsers: true,
      canChangePasswords: true,
      canEditProfiles: true,
      canManageRoles: true,
      canPublishNews: true,
      canDeleteContent: true,
      canAccessAdminPanel: true,
      canEditAllNews: true,
      canManageSongs: true,
      canManageWebhooks: true,
      canManageRanks: true,
    };
  }
  if (role === 'staff' || role === 'editor') {
    return {
      canManageUsers: false,
      canChangePasswords: false,
      canEditProfiles: false,
      canManageRoles: false,
      canPublishNews: true,
      canDeleteContent: false,
      canAccessAdminPanel: false,
      canEditAllNews: true,
      canManageSongs: false,
      canManageWebhooks: false,
      canManageRanks: false,
    };
  }
  return {
    canManageUsers: false,
    canChangePasswords: false,
    canEditProfiles: false,
    canManageRoles: false,
    canPublishNews: false,
    canDeleteContent: false,
    canAccessAdminPanel: false,
    canEditAllNews: false,
    canManageSongs: false,
    canManageWebhooks: false,
    canManageRanks: false,
  };
}

export async function syncFirebaseUserDocs(firebaseUser: FirebaseUser): Promise<User> {
  const uid = sanitizeFirestoreId(firebaseUser.uid);
  const role = await resolveUserRoleFromFirestore(firebaseUser);
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  let existingPublic: any = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) existingPublic = snap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const baseUsername = (
    existingPublic?.username ||
    firebaseUser.email?.split('@')[0] ||
    firebaseUser.displayName ||
    `player_${uid.slice(0, 6)}`
  )
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64) || `player_${uid.slice(0, 6)}`;

  const displayName = (existingPublic?.displayName || firebaseUser.displayName || baseUsername).slice(0, 80);
  const avatar = (existingPublic?.avatar || firebaseUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80').slice(0, 2048);

  if (!existingPublic) {
    try {
      await setDoc(userRef, {
        id: uid,
        username: baseUsername,
        displayName,
        avatar,
        bio: role === 'admin' ? 'Administrator of RoBeats News' : 'RoBeats rhythm player',
        role: role === 'admin' ? 'admin' : 'player',
        currentStreak: 1,
        bestStreak: 1,
        unlockedFrames: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }
  } else {
    try {
      const updatePayload: Record<string, any> = {
        displayName,
        avatar,
        updatedAt: serverTimestamp(),
      };
      if (role === 'admin' && existingPublic.role !== 'admin') {
        updatePayload.role = 'admin';
      }
      await updateDoc(userRef, updatePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  }

  // Write PII strictly into isolated private subcollection
  try {
    await setDoc(
      privateRef,
      {
        uid,
        email: (firebaseUser.email || '').slice(0, 254),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
  }

  return {
    id: uid,
    username: baseUsername,
    email: firebaseUser.email || undefined,
    displayName,
    avatar,
    bio: existingPublic?.bio || (role === 'admin' ? 'Administrator of RoBeats News' : 'RoBeats rhythm player'),
    robloxUsername: existingPublic?.robloxUsername || '',
    roBeatsRank: existingPublic?.roBeatsRank || 'Beginner',
    preferredNoteSpeed: existingPublic?.preferredNoteSpeed || '1.8x',
    role,
    permissions: getPermissionsForRole(role),
    createdAt: normalizeTimestamp(existingPublic?.createdAt),
    currentStreak: existingPublic?.currentStreak ?? 1,
    bestStreak: existingPublic?.bestStreak ?? 1,
    unlockedFrames: Array.isArray(existingPublic?.unlockedFrames) ? existingPublic.unlockedFrames : [],
    equippedAvatarFrame: existingPublic?.equippedAvatarFrame || undefined,
  };
}
