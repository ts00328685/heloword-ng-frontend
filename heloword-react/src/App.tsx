import React, { Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import AppInitializer from './components/AppInitializer';
import AlertDialog from './components/AlertDialog';
import BottomTabs from './components/BottomTabs';
import MessageNotificationToast from './components/MessageNotificationToast';
import LoadingSpinner from './components/LoadingSpinner';
import Toast from './components/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SocialProvider } from './contexts/SocialContext';
import { ChallengeProvider } from './contexts/ChallengeContext';
import GuestSetupModal from './components/GuestSetupModal';
import WalkthroughOverlay from './components/WalkthroughOverlay';
import CookieConsentBanner from './components/CookieConsentBanner';
// Eagerly loaded — first pages users land on
import HomePage from './pages/Home/HomePage';
import LoginPage from './pages/Login/LoginPage';
// Lazy loaded — split into separate chunks to reduce initial bundle
const VocabularyPage      = React.lazy(() => import('./pages/Vocabulary/VocabularyPage'));
const VocabularyListPage  = React.lazy(() => import('./pages/Vocabulary/VocabularyListPage'));
const VocabularyQuizPage  = React.lazy(() => import('./pages/Vocabulary/VocabularyQuizPage'));
const ReviewPage          = React.lazy(() => import('./pages/Review/ReviewPage'));
const StatsPage           = React.lazy(() => import('./pages/Stats/StatsPage'));
const InfoPage            = React.lazy(() => import('./pages/Info/InfoPage'));
const SocialPage          = React.lazy(() => import('./pages/Social/SocialPage'));
const ChallengePage       = React.lazy(() => import('./pages/Challenge/ChallengePage'));
const SentenceScramblePage = React.lazy(() => import('./pages/Challenge/SentenceScramblePage'));
const MultiChoicePage     = React.lazy(() => import('./pages/Challenge/MultiChoicePage'));
const UserVocabPage       = React.lazy(() => import('./pages/UserVocab/UserVocabPage'));
const UserVocabGroupPage  = React.lazy(() => import('./pages/UserVocab/UserVocabGroupPage'));
const WordPreviewPage     = React.lazy(() => import('./pages/Review/WordPreviewPage'));

// Pages where we don't show the bottom tabs
const NO_TABS_PATHS = ['/vocabulary/quiz', '/login'];

const AppLayout: React.FC = () => {
  const showTabs = !NO_TABS_PATHS.some((p) =>
    window.location.pathname.startsWith(p)
  );

  return (
    <AppInitializer>
      {/* Global overlays */}
      <LoadingSpinner />
      <Toast />
      <AlertDialog />

      {/* Routes — show a full-screen skeleton while lazy chunks are downloading */}
      <Suspense fallback={
        <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
          <Route path="/vocabulary/list" element={<VocabularyListPage />} />
          <Route path="/vocabulary/quiz" element={<VocabularyQuizPage />} />
          <Route path="/review" element={<ReviewPage />} />
        <Route path="/review/preview" element={<WordPreviewPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/info" element={<InfoPage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/challenge" element={<ChallengePage />} />
          <Route path="/challenge/scramble" element={<SentenceScramblePage />} />
          <Route path="/challenge/quiz" element={<MultiChoicePage />} />
          <Route path="/user-vocab" element={<UserVocabPage />} />
          <Route path="/user-vocab/:groupId" element={<UserVocabGroupPage />} />
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>

      {/* Real-time message notification toasts */}
      <MessageNotificationToast />

      {/* Bottom navigation — hidden on quiz & login */}
      <BottomTabsWrapper />

      {/* Guest nickname setup, first-visit walkthrough & cookie consent */}
      <GuestSetupModal />
      <WalkthroughOverlay />
      <CookieConsentBanner />
    </AppInitializer>
  );
};

/**
 * Renders bottom tabs except on quiz and login pages.
 * Uses a small component so it can re-read location from React Router context.
 */
const BottomTabsWrapper: React.FC = () => {
  // We use a simple check via Routes to conditionally render
  return (
    <Routes>
      <Route path="/vocabulary/quiz" element={null} />
      <Route path="/login" element={null} />
      <Route path="*" element={<BottomTabs />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <UIProvider>
        <AuthProvider>
          <DataProvider>
            <NotificationProvider>
              <SocialProvider>
                <ChallengeProvider>
                  <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                    <AppLayout />
                  </Router>
                </ChallengeProvider>
              </SocialProvider>
            </NotificationProvider>
          </DataProvider>
        </AuthProvider>
      </UIProvider>
    </ThemeProvider>
  );
};

export default App;
