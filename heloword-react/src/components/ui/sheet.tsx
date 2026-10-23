import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';

/** Bottom sheet (centered dialog on wide screens) with a title and a "Done" button. */
export const Sheet: React.FC<{ title: string; open: boolean; onClose: () => void; children: React.ReactNode }> = ({ title, open, onClose, children }) => {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md max-h-[85vh] flex flex-col bg-surface border-t sm:border border-line rounded-t-xl sm:rounded-lg animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
          <h2 className="font-serif text-base text-ink">{title}</h2>
          <button onClick={onClose} className="text-sm text-ink border-b border-ink/30 hover:border-ink">
            {t('common.done')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 safe-area-bottom">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

/** Titled group inside a Sheet. */
export const SheetSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <p className="text-[10px] font-medium uppercase tracking-label text-ink-faint mb-2">{title}</p>
    {children}
  </section>
);
