import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightContent?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ title, showBack = false, rightContent }) => {
  const navigate = useNavigate();
  const { user, isLoggedIn, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
        {/* Left: back button or logo */}
        <div className="flex items-center gap-2 min-w-[40px]">
          {showBack ? (
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Go back"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <span className="text-blue-500 font-bold text-lg select-none">Hw</span>
          )}
        </div>

        {/* Center: title */}
        <h1 className="text-base font-semibold text-gray-800 truncate px-2">{title}</h1>

        {/* Right: custom content or user avatar/logout */}
        <div className="flex items-center gap-1 min-w-[40px] justify-end">
          {rightContent ?? (
            isLoggedIn ? (
              <div className="flex items-center gap-2">
                {user.picture && (
                  <img
                    src={user.picture}
                    alt={user.nickname || user.fullname}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                )}
                <button
                  onClick={logout}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  aria-label="Logout"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="text-xs text-blue-500 font-medium hover:text-blue-700 transition-colors"
              >
                Login
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
