import {
  createContext,
  useContext,
  type ReactNode,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  applySessionToken,
  fetchCurrentUser,
  isSessionExpired,
  login as loginApi,
  register as registerApi,
} from '@/api/auth';
import { ApiError } from '@/api/client';
import { setUnauthorizedHandler } from '@/api/client';
import type { AuthSession, LoginCredentials, RegisterCredentials, User } from '@/types/auth';

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (credentials: RegisterCredentials) => Promise<{ success: boolean; error?: string }>;
  updateSession: (session: AuthSession) => void;
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const persistSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    applySessionToken(nextSession);

    if (nextSession) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  const updateSession = useCallback(
    (nextSession: AuthSession) => {
      persistSession(nextSession);
    },
    [persistSession],
  );

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<boolean> => {
      if (!credentials.username.trim() || !credentials.password.trim()) {
        return false;
      }

      try {
        const nextSession = await loginApi(credentials);
        persistSession(nextSession);
        return true;
      } catch {
        return false;
      }
    },
    [persistSession],
  );

  const register = useCallback(
    async (credentials: RegisterCredentials): Promise<{ success: boolean; error?: string }> => {
      if (!credentials.username.trim() || !credentials.password.trim()) {
        return { success: false, error: 'Username and password are required.' };
      }

      try {
        const nextSession = await registerApi(credentials);
        persistSession(nextSession);
        return { success: true };
      } catch (error) {
        const message =
          error instanceof ApiError && error.message
            ? error.message
            : 'Registration failed. Check your details and ensure the API is running.';
        return { success: false, error: message };
      }
    },
    [persistSession],
  );

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const stored = loadStoredSession();

      if (!stored || isSessionExpired(stored)) {
        persistSession(null);
        if (!cancelled) {
          setIsRestoring(false);
        }
        return;
      }

      applySessionToken(stored);
      setSession(stored);

      try {
        const user = await fetchCurrentUser();
        const restoredSession: AuthSession = { user, token: stored.token };

        if (!cancelled) {
          persistSession(restoredSession);
        }
      } catch {
        if (!cancelled) {
          persistSession(null);
        }
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [persistSession]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        isAuthenticated: session !== null,
        isRestoring,
        login,
        register,
        updateSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const STORAGE_KEY = 'somnet-auth';

function loadStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as AuthSession;

    if (!parsed.user || !parsed.token?.accessToken || !parsed.token.expiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
