import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../api/auth', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
  logout: vi.fn(),
}));

import { useAuth } from '../useAuth';
import * as authApi from '../../api/auth';
import type { AuthUser } from '../../types';

const fakeUser: AuthUser = {
  id: 'u-1',
  email: 'me@example.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  created_at: '2024-01-01T00:00:00Z',
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the user when getMe succeeds (200 → user)', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('falls back to anonymous when getMe rejects (401)', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A 401 is the normal anonymous path: null user, anonymous state, no error
    // surfaced (the test resolving without an unhandled rejection is the proof).
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login re-fetches the user and sets authenticated', async () => {
    // Mount resolves anonymous (401), then the post-login getMe returns the user.
    vi.mocked(authApi.getMe)
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce(fakeUser);
    vi.mocked(authApi.login).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login({ email: 'me@example.com', password: 'secret123' });
    });

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'secret123',
    });
    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout clears the user', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(fakeUser);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(authApi.logout).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('register calls the api without auto-login', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(authApi.register).mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register({ email: 'new@example.com', password: 'secret123' });
    });

    expect(authApi.register).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret123',
    });
    // No auto-login: the user stays anonymous until they log in.
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
