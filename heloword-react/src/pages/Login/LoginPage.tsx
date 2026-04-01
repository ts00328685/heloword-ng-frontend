import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { environment } from '../../config/environment';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { User } from '../../models';
import { doPost } from '../../services/api.service';

// Build the external-browser URL once at module level (synchronous, no re-render needed).
const lineExternalUrl = (() => {
  const url = new URL(window.location.href);
  url.searchParams.set('openExternalBrowser', '1');
  return url.toString();
})();

const isLineWebview = /Line\//i.test(navigator.userAgent);

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const { showSystemError, showLoading, hideLoading } = useUI();

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      showSystemError();
      return;
    }

    showLoading();
    try {
      const response = await doPost('/service-auth/api/auth/verify-google-id', {
        credential: credentialResponse.credential,
        provider: 'GOOGLE',
        idToken: credentialResponse.credential,
      });

      const user: User = response.data || {};

      if (!user.email) {
        showSystemError();
        return;
      }

      updateUser(user);
      navigate('/home', { replace: true });
    } catch {
      showSystemError();
    } finally {
      hideLoading();
    }
  };

  const handleGoogleError = () => {
    showSystemError();
  };

  return (
    <GoogleOAuthProvider clientId={environment.googleClientId}>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title="Login" showBack />

        <main className="flex-1 flex items-center justify-center px-4 pb-20">
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                <span className="text-white text-3xl font-black">Hw</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('login.welcome')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('login.subtitle')}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                {t('login.continueGoogle')}
              </h2>

              {isLineWebview ? (
                /* LINE's in-app browser blocks Google OAuth.
                   A real <a> link with openExternalBrowser=1 is the only
                   reliable way to hand off to the system browser. */
                <div className="flex flex-col items-center gap-3">
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center leading-relaxed">
                    Google sign-in requires an external browser.
                  </p>
                  <a
                    href={lineExternalUrl}
                    className="w-full text-center bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    Open in Browser to Sign In
                  </a>
                </div>
              ) : (
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    size="large"
                    shape="pill"
                    text="signin_with"
                    useOneTap={false}
                  />
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4 leading-relaxed">
                {t('login.agreement')}
              </p>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={() => navigate('/home')}
                className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {t('login.skipLogin')}
              </button>
            </div>
          </div>
        </main>
      </div>
    </GoogleOAuthProvider>
  );
};

export default LoginPage;
