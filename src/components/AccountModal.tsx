import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Check,
  AlertCircle,
  LogOut,
  Edit3,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Shield,
  Flame,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './UserAvatar';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'profile';
  onOpenAdminPanel?: () => void;
}

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'login',
  onOpenAdminPanel,
}) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    authError,
    loginWithGoogle,
    logout,
    updateProfile,
    clearError,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'profile' | 'edit'>('login');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSuccessMessage(null);
      clearError();
      return;
    }

    if (isAuthenticated) {
      setActiveTab(initialTab === 'profile' ? 'profile' : 'profile');
      if (user) {
        setEditUsername(user.username || '');
        setEditDisplayName(user.displayName || user.username);
        setEditAvatar(user.avatar || DEFAULT_AVATAR);
      }
    } else {
      setActiveTab('login');
    }
  }, [isOpen, isAuthenticated, user, initialTab]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    clearError();
    const ok = await loginWithGoogle();
    if (ok) {
      setSuccessMessage('Signed in with Google & synced to Firebase Cloud!');
      setTimeout(() => {
        setSuccessMessage(null);
        setActiveTab('profile');
      }, 700);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage(null);

    const cleanUsername = editUsername
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 64);

    const ok = await updateProfile({
      username: cleanUsername,
      displayName: editDisplayName.trim(),
      avatar: editAvatar.trim() || DEFAULT_AVATAR,
    });

    if (ok) {
      setSuccessMessage('Profile updated in Cloud Firestore!');
      setTimeout(() => {
        setSuccessMessage(null);
        setActiveTab('profile');
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-[#10141E] border border-zinc-800 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-[#131926]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2 font-display">
                {isAuthenticated ? 'RoBeats! News Profile' : 'Sign in with Google'}
                {isAuthenticated && user?.role === 'admin' && (
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Admin
                  </span>
                )}
              </h2>
              {isAuthenticated && (
                <p className="text-xs text-zinc-400">
                  Signed in as {user?.email || `@${user?.username}`}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs when authenticated */}
        {isAuthenticated && (
          <div className="border-b border-zinc-800/80 bg-[#0E121C] px-6 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
            <button
              onClick={() => {
                setActiveTab('profile');
                setSuccessMessage(null);
              }}
              className={`py-3 px-3 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'profile'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              Profile
            </button>
            <button
              onClick={() => {
                setActiveTab('edit');
                setSuccessMessage(null);
              }}
              className={`py-3 px-3 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'edit'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Profile
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {successMessage && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {authError && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-xs text-red-300 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* ----------------- GOOGLE SIGN-IN VIEW ----------------- */}
          {!isAuthenticated && (
            <div className="space-y-5 py-2 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-950/30">
                <svg className="w-7 h-7" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.91z" />
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                </svg>
              </div>

              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-white font-display">
                  Sign In with Your Google Account
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Log in to access all features (as well as new features to be added in the future). Please read the &quot;Privacy&quot; section before sign in.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleGoogleLogin}
                className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-bold rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-700" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.91z" />
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ----------------- PROFILE OVERVIEW ----------------- */}
          {isAuthenticated && user && activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-zinc-900/90 to-[#121824] border border-zinc-800 flex flex-col sm:flex-row items-center sm:items-start gap-4">
                <UserAvatar
                  src={user.avatar || DEFAULT_AVATAR}
                  alt={user.displayName}
                  size="lg"
                />

                <div className="flex-1 text-center sm:text-left space-y-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight font-display">
                        {user.displayName || user.username}
                      </h3>
                      <p className="text-xs text-cyan-400 font-mono">@{user.username}</p>
                    </div>

                    <div className="flex items-center gap-1.5 self-center sm:self-start">
                      {user.currentStreak && user.currentStreak > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-orange-400" />
                          <span>{user.currentStreak}d Streak</span>
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase">
                        {user.role === 'robeatsdev' ? 'RoBeatsDev' : user.role}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 pt-1 leading-relaxed">
                    User profile informations will be added soon! Working on this :)
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                {user.role === 'admin' && onOpenAdminPanel && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAdminPanel();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-500/10 cursor-pointer"
                  >
                    <Shield className="w-4 h-4 text-cyan-400" />
                    Open Admin Panel (User Roles & Settings)
                  </button>
                )}

                <button
                  onClick={() => setActiveTab('edit')}
                  className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Profile
                </button>
              </div>

              {/* Sign out bar */}
              <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-zinc-400 leading-relaxed flex-1 min-w-[200px]">
                  Remember that Google sign in will available only for TESTING, all data will be deleted after robeats news website official release
                </div>
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="py-1.5 px-3 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* ----------------- EDIT PROFILE ----------------- */}
          {isAuthenticated && user && activeTab === 'edit' && (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Username (@handle)
                </label>
                <div className="flex items-center bg-zinc-900/90 border border-zinc-800 rounded-xl focus-within:border-cyan-500/70 transition-all overflow-hidden">
                  <span className="pl-3 pr-1 text-xs font-mono text-zinc-500 select-none">@</span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="your_username"
                    className="w-full pr-3 py-2 text-xs bg-transparent text-white focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Letters, numbers, and underscores only (minimum 2 characters)</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full px-3 py-2 text-xs bg-zinc-900/90 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-cyan-500/70 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                  Custom Image URL
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {editAvatar ? (
                      <img
                        src={editAvatar}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                        }}
                      />
                    ) : (
                      <UserIcon className="w-5 h-5 text-zinc-600" />
                    )}
                  </div>
                  <input
                    type="url"
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder="https://example.com/your-image.jpg"
                    className="flex-1 px-3 py-2 text-xs bg-zinc-900/90 border border-zinc-800 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/70"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  className="py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  Save Profile Changes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="py-2.5 px-4 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
