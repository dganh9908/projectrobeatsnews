import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import {
  syncFirebaseUserDocs,
  fetchAllUsersFromFirestore,
  updateUserInFirestoreAsAdmin,
  deleteUserInFirestoreAsAdmin,
} from '../services/firestoreService';
import { User } from '../types';
import { safeJson } from '../utils/safeJson';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirebaseReady: boolean;
  firebaseUser: FirebaseUser | null;
  authError: string | null;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  updateProfile: (profileData: Partial<User>) => Promise<boolean>;
  deleteAccount: (id?: string) => Promise<boolean>;
  allUsers: User[];
  fetchAllUsers: () => Promise<void>;
  clearError: () => void;
  isAdmin: boolean;
  isStaff: boolean;
  adminGetUsers: () => Promise<User[]>;
  adminGetStats: () => Promise<any>;
  adminUpdateUser: (userId: string, data: Partial<User> & { permissions?: any }) => Promise<{ success: boolean; error?: string; user?: User }>;
  adminDeleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('robeats_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('robeats_auth_token') || localStorage.getItem('robeats_token')
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFirebaseReady, setIsFirebaseReady] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Google Auth (Firebase) is the single source of truth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setIsFirebaseReady(true);

      if (fbUser) {
        try {
          const syncedUser = await syncFirebaseUserDocs(fbUser);
          const idToken = await fbUser.getIdToken();
          setUser(syncedUser);
          setToken(idToken);
          localStorage.setItem('robeats_auth_token', idToken);
          localStorage.setItem('robeats_token', idToken);
          localStorage.setItem('robeats_current_user', JSON.stringify(syncedUser));
        } catch (err: any) {
          console.error('Failed to sync Google account with Firestore:', err);
          setAuthError('Unable to sync Google profile with Cloud Firestore.');
        } finally {
          setIsLoading(false);
        }
      } else {
        // Signed out
        localStorage.removeItem('robeats_auth_token');
        localStorage.removeItem('robeats_token');
        localStorage.removeItem('robeats_current_user');
        setUser(null);
        setToken(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async (): Promise<boolean> => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        const syncedUser = await syncFirebaseUserDocs(cred.user);
        const idToken = await cred.user.getIdToken();
        setFirebaseUser(cred.user);
        setUser(syncedUser);
        setToken(idToken);
        localStorage.setItem('robeats_auth_token', idToken);
        localStorage.setItem('robeats_token', idToken);
        localStorage.setItem('robeats_current_user', JSON.stringify(syncedUser));
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Google sign-in popup was closed before completing.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'This domain is not authorized in Firebase Auth. Add it under Firebase Console → Authentication → Settings → Authorized domains.'
        );
      } else {
        setAuthError(err?.message || 'Google sign-in failed. Please try again.');
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('robeats_auth_token');
    localStorage.removeItem('robeats_token');
    localStorage.removeItem('robeats_current_user');
    setToken(null);
    setUser(null);
    setAuthError(null);
    signOut(auth).catch(() => {});
  };

  const updateProfile = async (profileData: Partial<User>): Promise<boolean> => {
    if (!user || !auth.currentUser) return false;

    const updatedUser: User = { ...user, ...profileData };

    try {
      const uid = auth.currentUser.uid;
      const fsUpdate: Record<string, any> = { updatedAt: serverTimestamp() };
      if (profileData.username !== undefined) {
        const cleanUsername = String(profileData.username)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 64);
        if (cleanUsername.length < 2) {
          setAuthError('Username must be at least 2 characters (letters, numbers, or underscores).');
          return false;
        }
        fsUpdate.username = cleanUsername;
        updatedUser.username = cleanUsername;
      }
      if (profileData.displayName !== undefined) fsUpdate.displayName = String(profileData.displayName).slice(0, 80);
      if (profileData.robloxUsername !== undefined) fsUpdate.robloxUsername = String(profileData.robloxUsername).slice(0, 64);
      if (profileData.avatar !== undefined) fsUpdate.avatar = String(profileData.avatar).slice(0, 2048);
      if (profileData.bio !== undefined) fsUpdate.bio = String(profileData.bio).slice(0, 500);
      if (profileData.roBeatsRank !== undefined) fsUpdate.roBeatsRank = String(profileData.roBeatsRank).slice(0, 40);
      if (profileData.preferredNoteSpeed !== undefined) fsUpdate.preferredNoteSpeed = String(profileData.preferredNoteSpeed).slice(0, 20);
      if (profileData.currentStreak !== undefined) fsUpdate.currentStreak = Number(profileData.currentStreak);
      if (profileData.bestStreak !== undefined) fsUpdate.bestStreak = Number(profileData.bestStreak);
      await updateDoc(doc(db, 'users', uid), fsUpdate);

      if (profileData.lastCheckInDate !== undefined) {
        await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
          lastCheckInDate: String(profileData.lastCheckInDate).slice(0, 32),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      setUser(updatedUser);
      localStorage.setItem('robeats_current_user', JSON.stringify(updatedUser));
    } catch (err) {
      console.warn('Firestore profile update warning:', err);
      setAuthError('Failed to update profile in Cloud Firestore.');
      return false;
    }

    return true;
  };

  const fetchAllUsers = async () => {
    try {
      const list = await fetchAllUsersFromFirestore();
      setAllUsers(list);
    } catch (err) {
      console.warn('Could not list Firestore users:', err);
    }
  };

  const deleteAccount = async (targetId?: string): Promise<boolean> => {
    const idToDelete = targetId || user?.id;
    if (!idToDelete) return false;
    try {
      await deleteUserInFirestoreAsAdmin(idToDelete);
      setAllUsers((prev) => prev.filter((u) => u.id !== idToDelete));
      if (idToDelete === user?.id) {
        logout();
      }
      return true;
    } catch (err) {
      console.error('Failed to delete Firestore user:', err);
      return false;
    }
  };

  const clearError = () => setAuthError(null);

  const adminGetUsers = async (): Promise<User[]> => {
    try {
      const list = await fetchAllUsersFromFirestore();
      setAllUsers(list);
      return list;
    } catch (err) {
      console.warn('Firestore admin user list fallback:', err);
      return allUsers;
    }
  };

  const adminGetStats = async (): Promise<any> => {
    try {
      const list = await fetchAllUsersFromFirestore();
      return {
        totalUsers: list.length,
        admins: list.filter((u) => u.role === 'admin').length,
        staff: list.filter((u) => u.role === 'staff').length,
        robeatsdev: list.filter((u) => u.role === 'robeatsdev').length,
        players: list.filter((u) => u.role === 'player').length,
        serverTime: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  };

  const adminUpdateUser = async (
    userId: string,
    data: Partial<User> & { permissions?: any }
  ): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const updated = await updateUserInFirestoreAsAdmin(userId, {
        displayName: data.displayName,
        avatar: data.avatar,
        role: data.role,
      });
      if (updated) {
        setAllUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
        if (user?.id === userId) {
          setUser(updated);
          localStorage.setItem('robeats_current_user', JSON.stringify(updated));
        }
        return { success: true, user: updated };
      }
      return { success: false, error: 'User not found in Firestore' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update user in Firestore' };
    }
  };

  const adminDeleteUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    const ok = await deleteAccount(userId);
    return ok ? { success: true } : { success: false, error: 'Failed to delete user' };
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'robeatsdev';
  const isStaff = isAdmin || user?.role === 'staff' || user?.role === 'editor';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user),
        isAdmin,
        isStaff,
        isLoading,
        isFirebaseReady,
        firebaseUser,
        authError,
        loginWithGoogle,
        logout,
        updateProfile,
        deleteAccount,
        allUsers,
        fetchAllUsers,
        clearError,
        adminGetUsers,
        adminGetStats,
        adminUpdateUser,
        adminDeleteUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
