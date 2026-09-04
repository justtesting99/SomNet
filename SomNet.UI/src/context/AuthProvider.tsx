import { createContext, useContext, type ReactNode, useState, useCallback } from 'react';
import type { User, LoginCredentials } from '@/types/auth';

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadStoredUser());

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (!credentials.username.trim() || !credentials.password.trim()) {
      return false;
    }

    const authenticatedUser: User = {
      username: credentials.username.trim(),
      displayName: credentials.username.trim(),
    };

    setUser(authenticatedUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const STORAGE_KEY = 'somnet-auth';

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
