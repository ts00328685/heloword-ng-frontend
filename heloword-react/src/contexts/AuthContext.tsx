import React, { createContext, useCallback, useContext, useState } from 'react';
import { User } from '../models';
import { doPost, resetApiInstance } from '../services/api.service';

interface AuthContextType {
  user: User;
  isLoggedIn: boolean;
  hasCheckedLoginStatus: boolean;
  setHasCheckedLoginStatus: (v: boolean) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  hasAnyRole: (roles: string[]) => boolean;
  hasAllRoles: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>({} as User);
  const [hasCheckedLoginStatus, setHasCheckedLoginStatus] = useState(false);

  const updateUser = useCallback((newUser: User) => {
    const enriched: User = { ...newUser, isLoggedIn: !!newUser?.email };
    setUser(enriched);
  }, []);

  const logout = useCallback(async () => {
    const wasLoggedIn = !!user?.email;
    try {
      await doPost('/service-auth/api/auth/logout');
    } catch {
      // Ignore errors on logout
    }
    setUser({} as User);
    resetApiInstance();
    // Only redirect if the user had an active session — prevents refresh loops
    // triggered by 9403 responses when the user was never logged in
    if (wasLoggedIn) {
      window.location.href = '/';
    }
  }, [user]);

  const hasAnyRole = useCallback(
    (roles: string[]) => {
      const userRoles = user?.roles?.map((r) => r.name) || [];
      return roles.some((r) => userRoles.includes(r));
    },
    [user]
  );

  const hasAllRoles = useCallback(
    (roles: string[]) => {
      const userRoles = user?.roles?.map((r) => r.name) || [];
      return roles.every((r) => userRoles.includes(r));
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user?.isLoggedIn,
        hasCheckedLoginStatus,
        setHasCheckedLoginStatus,
        updateUser,
        logout,
        hasAnyRole,
        hasAllRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);
