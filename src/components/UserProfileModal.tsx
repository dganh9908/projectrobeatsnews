import React, { useState, useEffect } from 'react';
import {
  X,
  Crown,
  Shield,
  Zap,
  User as UserIcon,
  Edit3,
  Flame,
} from 'lucide-react';
import { User, RankConfig } from '../types';
import { useAuth } from '../context/AuthContext';
import { fetchRanksList, fetchUserProfile } from '../services/fandomService';
import { UserAvatar } from './UserAvatar';

interface UserProfileModalProps {
  user: User | {
    id?: string;
    name?: string;
    username?: string;
    displayName?: string;
    avatar?: string;
    role?: string;
    roBeatsRank?: string;
    [key: string]: any;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onEditOwnProfile?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user: initialUser,
  isOpen,
  onClose,
  onEditOwnProfile,
}) => {
  const { user: currentUser } = useAuth();
  const [profileData, setProfileData] = useState<any>(initialUser);
  const [ranks, setRanks] = useState<RankConfig[]>([]);

  useEffect(() => {
    fetchRanksList().then(setRanks).catch(() => {});
  }, []);

  // When initialUser changes, fetch full profile so rank, streak, and role are up to date
  useEffect(() => {
    if (!initialUser || !isOpen) return;

    setProfileData(initialUser);
    const identifier = initialUser.username || initialUser.name || initialUser.displayName || initialUser.id;
    if (!identifier) return;

    fetchUserProfile(identifier)
      .then((fullUser) => {
        if (fullUser) {
          setProfileData((prev: any) => ({
            ...prev,
            ...fullUser,
          }));
        }
      })
      .catch(() => {});
  }, [initialUser, isOpen]);

  if (!isOpen || !profileData) return null;

  const rawRole = (profileData.role || 'player').toLowerCase();
  const roleName =
    rawRole === 'admin' ? 'Administrator' :
    rawRole === 'staff' ? 'RoBeats Staff' :
    rawRole === 'robeatsdev' ? 'RoBeats Developer' :
    'Rhythm Player';

  const roleColorClass =
    rawRole === 'admin' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
    rawRole === 'staff' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
    rawRole === 'robeatsdev' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' :
    'bg-zinc-800 text-zinc-400 border-zinc-700/60';

  const username = profileData.username || profileData.name?.toLowerCase().replace(/\s+/g, '_') || 'player';
  const displayName = profileData.displayName || profileData.name || username;
  const avatar = profileData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

  const isSelf = currentUser && (currentUser.id === profileData.id || currentUser.username?.toLowerCase() === username.toLowerCase());

  const rankObj = profileData.roBeatsRank ? ranks.find(r => r.name.toLowerCase() === profileData.roBeatsRank.toLowerCase()) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[#0D111A] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-post-entrance"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-[#111622]">
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">User Profile</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Hero Banner & Avatar */}
          <div className="relative rounded-2xl bg-gradient-to-br from-cyan-950/40 via-zinc-900 to-zinc-950 p-4 border border-zinc-800 flex flex-col items-center text-center">
            {/* Avatar with Role Crown / Badge */}
            <div className="relative mb-3">
              <UserAvatar
                src={avatar}
                alt={displayName}
                size="xl"
              />
              {rawRole === 'admin' && (
                <span className="absolute -bottom-1 -right-1 p-1 bg-amber-500 text-zinc-950 rounded-full shadow-md z-20" title="Administrator">
                  <Crown className="w-3.5 h-3.5" />
                </span>
              )}
              {rawRole === 'staff' && (
                <span className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 text-zinc-950 rounded-full shadow-md z-20" title="Staff Member">
                  <Shield className="w-3.5 h-3.5" />
                </span>
              )}
              {rawRole === 'robeatsdev' && (
                <span className="absolute -bottom-1 -right-1 p-1 bg-purple-500 text-zinc-950 rounded-full shadow-md z-20" title="RoBeats Dev">
                  <Zap className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            {/* Display Name & Username */}
            <h3 className="text-lg font-black text-white leading-tight">{displayName}</h3>
            <p className="text-xs text-cyan-400 font-mono mt-0.5">@{username}</p>

            {/* Role, Rank & Streak Badges */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${roleColorClass}`}>
                {roleName}
              </span>

              {profileData.currentStreak && profileData.currentStreak > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-orange-950/80 text-orange-300 border-orange-500/40 flex items-center gap-1 shadow-xs">
                  <Flame className="w-3 h-3 text-orange-400" />
                  <span>{profileData.currentStreak}d Streak</span>
                </span>
              )}

              {rankObj && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-zinc-900 flex items-center gap-1 shadow-xs"
                  style={{ color: rankObj.color, borderColor: `${rankObj.color}40` }}
                >
                  {rankObj.iconUrl && (
                    <img src={rankObj.iconUrl} alt={rankObj.name} className="w-3 h-3 object-contain shrink-0" />
                  )}
                  <span>{rankObj.name}</span>
                </span>
              )}
            </div>
          </div>

          {/* Upcoming Profile Info Notice */}
          <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl text-center">
            <p className="text-xs text-zinc-400 leading-relaxed">
              User profile informations will be added soon! Working on this :)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-[#111622] flex items-center justify-between">
          {isSelf && onEditOwnProfile && (
            <button
              onClick={() => {
                onClose();
                onEditOwnProfile();
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit My Profile</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs cursor-pointer transition-colors ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
