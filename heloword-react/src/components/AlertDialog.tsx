import React from 'react';
import { useUI } from '../contexts/UIContext';

const AlertDialog: React.FC = () => {
  const { alert, dismissAlert } = useUI();

  if (!alert.visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{alert.header}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">{alert.message}</p>
        <button
          onClick={dismissAlert}
          className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors duration-150"
        >
          {alert.buttonText}
        </button>
      </div>
    </div>
  );
};

export default AlertDialog;
