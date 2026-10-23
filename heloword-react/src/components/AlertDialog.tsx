import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../contexts/UIContext';

const AlertDialog: React.FC = () => {
  const { alert, dismissAlert } = useUI();
  const { t } = useTranslation();

  if (!alert.visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <h3 className="text-lg font-semibold text-ink mb-3">{alert.header || t('common.notice')}</h3>
        <p className="text-sm text-ink-muted mb-6 leading-relaxed">{alert.message}</p>
        <button
          onClick={dismissAlert}
          className="w-full bg-ink hover:bg-ink/85 active:bg-ink/85 text-paper font-semibold py-3 rounded-xl transition-colors duration-150"
        >
          {alert.buttonText || t('common.ok')}
        </button>
      </div>
    </div>
  );
};

export default AlertDialog;
