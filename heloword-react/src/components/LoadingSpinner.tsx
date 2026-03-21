import React from 'react';
import { useUI } from '../contexts/UIContext';

const LoadingSpinner: React.FC = () => {
  const { loading } = useUI();

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600 font-medium">Loading...</span>
      </div>
    </div>
  );
};

export default LoadingSpinner;
