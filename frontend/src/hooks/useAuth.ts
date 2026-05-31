import { useState, useEffect, useCallback } from 'react';
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  forgotPassword as apiForgotPassword,
  logout as apiLogout,
} from '../api/auth';
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
} from '../types';

interface UseAuthReturn {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  forgotPassword: (data: ForgotPasswordRequest) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Manage the cookie-based auth session.
 *
 * Identity is resolved by calling `GET /api/auth/me`. A logged-in user yields a
 * profile; an anonymous visitor yields a 401 which we treat as the normal,
 * expected path (no error UI, no token in state/localStorage — the auth cookie
 * is httpOnly and invisible to JS).
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isAuthenticated = user !== null;

  // Resolve identity once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch {
        // A 401 (or any error) here means "not logged in". This is a deliberate
        // graceful path for the anonymous-first app, not a swallowed error:
        // getMe rejects on 401 and we resolve that to the anonymous state.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (data: LoginRequest): Promise<void> => {
    // Let errors propagate — the form surfaces the backend message.
    await apiLogin(data);
    const me = await getMe();
    setUser(me);
  }, []);

  const register = useCallback(async (data: RegisterRequest): Promise<void> => {
    // No auto-login: per spec the user "can then log in". Errors propagate.
    await apiRegister(data);
  }, []);

  const forgotPassword = useCallback(
    async (data: ForgotPasswordRequest): Promise<void> => {
      // Errors propagate so the form can confirm/deny the request.
      await apiForgotPassword(data);
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    // The server clears the httpOnly cookie; clearing local state alone would
    // leave the cookie valid. Clear local state regardless of the request
    // outcome so the UI never gets stuck authenticated.
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    forgotPassword,
    logout,
  };
}
