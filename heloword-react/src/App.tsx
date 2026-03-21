import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import AppInitializer from './components/AppInitializer';
import AlertDialog from './components/AlertDialog';
import BottomTabs from './components/BottomTabs';
import LoadingSpinner from './components/LoadingSpinner';
import Toast from './components/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import HomePage from './pages/Home/HomePage';
import InfoPage from './pages/Info/InfoPage';
import LoginPage from './pages/Login/LoginPage';
import ReviewPage from './pages/Review/ReviewPage';
import StatsPage from './pages/Stats/StatsPage';
import VocabularyListPage from './pages/Vocabulary/VocabularyListPage';
import VocabularyPage from './pages/Vocabulary/VocabularyPage';
import VocabularyQuizPage from './pages/Vocabulary/VocabularyQuizPage';

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

      {/* Routes */}
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/vocabulary/list" element={<VocabularyListPage />} />
        <Route path="/vocabulary/quiz" element={<VocabularyQuizPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/info" element={<InfoPage />} />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

      {/* Bottom navigation — hidden on quiz & login */}
      <BottomTabsWrapper />
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
              <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <AppLayout />
              </Router>
            </NotificationProvider>
          </DataProvider>
        </AuthProvider>
      </UIProvider>
    </ThemeProvider>
  );
};

export default App;
