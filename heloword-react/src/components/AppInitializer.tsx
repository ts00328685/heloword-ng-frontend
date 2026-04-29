import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { environment } from '../config/environment';
import { doPost } from '../services/api.service';

/**
 * AppInitializer runs the session bootstrap sequence on first mount:
 * 1. POST /service-auth/api/auth/init-cookie  — establishes session cookie
 * 2. POST /service-auth/api/auth/init-cipher  — retrieves AES key & IV
 * 3. POST /frontend-api/api/fe/user           — checks if a session already exists
 *
 * This mirrors Angular's PageActivateGuard behaviour.
 * Only runs once (checked via hasCheckedLoginStatus).
 */
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasCheckedLoginStatus, setHasCheckedLoginStatus, updateUser, logout } = useAuth();
  const { t } = useTranslation();
  const [ready, setReady] = useState(hasCheckedLoginStatus);
  const ranRef = useRef(false);

  useEffect(() => {
    const handleAuthError = () => logout();
    window.addEventListener('hw:auth-error', handleAuthError);
    return () => window.removeEventListener('hw:auth-error', handleAuthError);
  }, [logout]);

  useEffect(() => {
    if (hasCheckedLoginStatus || ranRef.current) {
      setReady(true);
      return;
    }

    ranRef.current = true;

    const init = async () => {
      try {
        // Step 1: init session cookie
        await doPost('/service-auth/api/auth/init-cookie');

        // Step 2: retrieve AES cipher key/IV
        const cipherResponse = await doPost('/service-auth/api/auth/init-cipher');
        if (cipherResponse.data) {
          environment.cipher = cipherResponse.data;
        }

        // Step 3: check existing session
        const userResponse = await doPost('/frontend-api/api/fe/user');
        if (userResponse.code === '0000' && userResponse.data?.user) {
          updateUser(userResponse.data.user);
        }
      } catch {
        // Silently fail — app still works without a session
      } finally {
        setHasCheckedLoginStatus(true);
        setReady(true);
      }
    };

    init();
  }, []);

  if (!ready) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t('common.startingUp')}</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppInitializer;
