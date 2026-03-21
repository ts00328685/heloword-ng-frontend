import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../contexts/NotificationContext';
import { useSocial } from '../contexts/SocialContext';

const BottomTabs: React.FC = () => {
  const { dueCount } = useNotifications();
  const { t } = useTranslation();
  const { unreadCounts, friends } = useSocial();

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
  const pendingRequests = friends.filter((f) => f.status === 'PENDING_RECEIVED').length;
  const socialBadge = totalUnread + pendingRequests;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex items-stretch max-w-2xl mx-auto">

        <TabItem path="/vocabulary" label={t('nav.quiz')} icon={(active) => (
          <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )} />

        <TabItem path="/review" label={t('nav.review')} badge={dueCount} icon={(active) => (
          <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        )} />

        <TabItem path="/home" label={t('nav.home')} icon={(active) => (
          <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        )} />

        <TabItem path="/stats" label={t('nav.stats')} icon={(active) => (
          <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )} />

        <TabItem path="/social" label={t('nav.social')} badge={socialBadge} icon={(active) => (
          <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        )} />

      </div>
    </nav>
  );
};

const TabItem: React.FC<{
  path: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  badge?: number;
}> = ({ path, label, icon, badge }) => (
  <NavLink
    to={path}
    className={({ isActive }) =>
      `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors relative ${
        isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
      }`
    }
  >
    {({ isActive }) => (
      <>
        <span className="relative">
          {icon(isActive)}
          {badge != null && badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span className={`text-xs font-medium ${isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}>
          {label}
        </span>
      </>
    )}
  </NavLink>
);

export default BottomTabs;
