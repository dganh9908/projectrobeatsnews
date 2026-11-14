import React from 'react';

interface UserAvatarProps {
  src?: string;
  alt?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  alt = 'Avatar',
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  }[size];

  const imgClasses = `${sizeClasses} rounded-full object-cover shrink-0`;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <img
        src={src || DEFAULT_AVATAR}
        alt={alt}
        className={`${imgClasses} border border-zinc-700/80`}
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
        }}
      />
    </div>
  );
};
