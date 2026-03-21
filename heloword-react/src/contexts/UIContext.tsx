import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface ToastState {
  message: string;
  duration: number;
  position: 'top' | 'bottom';
  visible: boolean;
}

interface AlertState {
  message: string;
  header: string;
  buttonText: string;
  visible: boolean;
}

interface UIContextType {
  toast: ToastState;
  alert: AlertState;
  loading: boolean;
  showToast: (msg: string, duration?: number, position?: 'top' | 'bottom') => void;
  showAlert: (message: string, header?: string, buttonText?: string) => void;
  dismissAlert: () => void;
  showLoading: () => void;
  hideLoading: () => void;
  showSystemError: () => void;
}

const UIContext = createContext<UIContextType>({} as UIContextType);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    duration: 2000,
    position: 'top',
    visible: false,
  });
  const [alert, setAlert] = useState<AlertState>({
    message: '',
    header: 'Notification',
    buttonText: 'Okay',
    visible: false,
  });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string, duration = 2000, position: 'top' | 'bottom' = 'top') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message: msg, duration, position, visible: true });
    timerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, duration);
  }, []);

  const showAlert = useCallback((message: string, header = 'Notification', buttonText = 'Okay') => {
    setAlert({ message, header, buttonText, visible: true });
  }, []);

  const dismissAlert = useCallback(() => {
    setAlert((a) => ({ ...a, visible: false }));
  }, []);

  const showLoading = useCallback(() => setLoading(true), []);
  const hideLoading = useCallback(() => setLoading(false), []);

  const showSystemError = useCallback(() => {
    setTimeout(() => showToast('System busy, please try later'), 500);
  }, [showToast]);

  return (
    <UIContext.Provider
      value={{
        toast,
        alert,
        loading,
        showToast,
        showAlert,
        dismissAlert,
        showLoading,
        hideLoading,
        showSystemError,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextType => useContext(UIContext);
