import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';

const StatsPage: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Statistics" />

      <main className="flex-1 pb-20 px-4 pt-8 max-w-2xl mx-auto w-full flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-3xl mx-auto mb-6 flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Statistics</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
            {!isLoggedIn
              ? 'Log in to view your quiz statistics and progress over time.'
              : 'Statistics feature is coming soon! Complete more quizzes to build your history.'}
          </p>

          {!isLoggedIn && (
            <button
              onClick={() => navigate('/login')}
              className="bg-blue-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl hover:bg-blue-600 transition-colors"
            >
              Login
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default StatsPage;
