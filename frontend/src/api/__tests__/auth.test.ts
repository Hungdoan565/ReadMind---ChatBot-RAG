import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../client';
import { login, register, forgotPassword, logout, getMe } from '../auth';

vi.mock('../client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('auth api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login posts form-encoded credentials with email mapped to username', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await login({ email: 'ban@example.com', password: 'secret123' });

    const [url, body] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get('username')).toBe('ban@example.com');
    expect((body as URLSearchParams).get('password')).toBe('secret123');
  });

  it('login maps LOGIN_BAD_CREDENTIALS to a Vietnamese message', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('LOGIN_BAD_CREDENTIALS'));

    await expect(login({ email: 'a@b.com', password: 'x' })).rejects.toThrow(
      'Email hoặc mật khẩu không đúng.',
    );
  });

  it('login maps LOGIN_USER_NOT_VERIFIED to a Vietnamese message', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('LOGIN_USER_NOT_VERIFIED'));

    await expect(login({ email: 'a@b.com', password: 'x' })).rejects.toThrow(
      'Tài khoản chưa được xác minh.',
    );
  });

  it('register returns the created user on success', async () => {
    const user = {
      id: 'u-1',
      email: 'ban@example.com',
      is_active: true,
      is_superuser: false,
      is_verified: false,
      created_at: '2024-01-01T00:00:00Z',
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: user });

    const result = await register({ email: 'ban@example.com', password: 'secret123' });

    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', {
      email: 'ban@example.com',
      password: 'secret123',
    });
    expect(result).toEqual(user);
  });

  it('register maps REGISTER_USER_ALREADY_EXISTS to a Vietnamese message', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('REGISTER_USER_ALREADY_EXISTS'));

    await expect(
      register({ email: 'taken@example.com', password: 'secret123' }),
    ).rejects.toThrow('Email này đã được đăng ký.');
  });

  it('register falls back to a generic message for object-shaped detail loss', async () => {
    // When `detail` is an object the global interceptor stringifies it to
    // "[object Object]"; that unknown message resolves to the generic default.
    vi.mocked(apiClient.post).mockRejectedValue(new Error('[object Object]'));

    await expect(
      register({ email: 'weak@example.com', password: '123' }),
    ).rejects.toThrow('Đã xảy ra lỗi. Vui lòng thử lại.');
  });

  it('forgotPassword posts the email and resolves without throwing', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await forgotPassword({ email: 'ban@example.com' });

    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/forgot-password', {
      email: 'ban@example.com',
    });
  });

  it('forgotPassword maps unknown errors to a generic Vietnamese message', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('some network failure'));

    await expect(forgotPassword({ email: 'ban@example.com' })).rejects.toThrow(
      'Đã xảy ra lỗi. Vui lòng thử lại.',
    );
  });

  it('logout posts to the cookie logout endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: undefined });

    await logout();

    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/logout');
  });

  it('getMe returns the current user', async () => {
    const user = {
      id: 'u-2',
      email: 'me@example.com',
      is_active: true,
      is_superuser: false,
      is_verified: true,
      created_at: '2024-01-01T00:00:00Z',
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: user });

    const result = await getMe();

    expect(apiClient.get).toHaveBeenCalledWith('/api/auth/me');
    expect(result).toEqual(user);
  });
});
