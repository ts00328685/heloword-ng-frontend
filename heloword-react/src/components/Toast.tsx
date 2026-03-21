import React from 'react';
import { useUI } from '../contexts/UIContext';

const Toast: React.FC = () => {
  const { toast } = useUI();

  if (!toast.visible) return null;

  const posClass = toast.position === 'bottom'
    ? 'bottom-20 left-1/2 -translate-x-1/2'
    : 'top-4 left-1/2 -translate-x-1/2';

  return (
    <div
      className={`fixed ${posClass} z-50 transform transition-all duration-300 ease-in-out`}
      style={{ minWidth: '200px', maxWidth: '90vw' }}
    >
      <div className="bg-gray-800 text-white text-sm rounded-xl px-4 py-3 shadow-lg flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span>{toast.message}</span>
      </div>
    </div>
  );
};

export default Toast;
