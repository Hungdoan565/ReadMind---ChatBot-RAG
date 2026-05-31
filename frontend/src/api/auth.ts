import apiClient from './client';
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
} from '../types';

/**
 * Known fastapi-users error codes mapped to friendly Vietnamese copy.
 *
 * The global response interceptor (`api/client.ts`) turns an axios error into
 * `new Error(detail)`. For string-shaped `detail` (e.g. login/register
 * failures) the resulting message is the raw machine code below. For
 * object-shaped `detail` (e.g. `REGISTER_INVALID_PASSWORD`, which carries a
 * `{ code, reason }` object) the interceptor stringifies it to
 * "[object Object]", so the structured reason is not available here — those
 * fall through to the generic default, which is acceptable for our UI.
 */
const AUTH_ERROR_MESSAGES: ReadonlyArray<{ code: string; message: string }> = [
  { code: 'LOGIN_BAD_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' },
  { code: 'LOGIN_USER_NOT_VERIFIED', message: 'Tài khoản chưa được xác minh.' },
  { code: 'REGISTER_USER_ALREADY_EXISTS', message: 'Email này đã được đăng ký.' },
  {
    code: 'REGISTER_INVALID_PASSWORD',
    message: 'Mật khẩu không hợp lệ. Vui lòng chọn mật khẩu mạnh hơn.',
  },
  {
    code: 'RESET_PASSWORD_BAD_TOKEN',
    message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
  },
];

const GENERIC_AUTH_ERROR = 'Đã xảy ra lỗi. Vui lòng thử lại.';

/**
 * Translate an auth rejection into a friendly Vietnamese message.
 *
 * Extracts a code/message string from the caught value (the interceptor's
 * mapped `Error`), then matches it case-insensitively against the known
 * fastapi-users codes. Unknown or object-shaped ("[object Object]") errors
 * resolve to a generic Vietnamese fallback so the UI never shows a raw machine
 * code. Callers re-throw `new Error(mapAuthError(err))`, which surfaces (not
 * swallows) the error for the forms to display.
 */
function mapAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const upper = raw.toUpperCase();
  for (const { code, message } of AUTH_ERROR_MESSAGES) {
    if (upper.includes(code)) {
      return message;
    }
  }
  return GENERIC_AUTH_ERROR;
}

/**
 * Log in against the cookie auth backend.
 *
 * fastapi-users' login router expects an OAuth2PasswordRequestForm, i.e. an
 * `application/x-www-form-urlencoded` body with `username` and `password`
 * fields (not JSON). The UI's `email` maps to `username`. On success the server
 * sets the httpOnly `readmind_auth` cookie; nothing JS-readable is returned.
 */
export async function login(data: LoginRequest): Promise<void> {
  const form = new URLSearchParams();
  form.append('username', data.email);
  form.append('password', data.password);
  try {
    await apiClient.post('/api/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

/**
 * Register a new account. Posts JSON `{ email, password }` and returns the
 * created user.
 */
export async function register(data: RegisterRequest): Promise<AuthUser> {
  try {
    const response = await apiClient.post<AuthUser>('/api/auth/register', {
      email: data.email,
      password: data.password,
    });
    return response.data;
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

/**
 * Request a password reset for the given email. The backend responds with an
 * empty body (HTTP 202).
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<void> {
  try {
    await apiClient.post('/api/auth/forgot-password', { email: data.email });
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

/**
 * Log out of the cookie auth backend. The server clears the `readmind_auth`
 * cookie via a `Set-Cookie: max-age=0` response.
 */
export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');
}

/**
 * Resolve the current user. Returns the authenticated user on success and
 * rejects (axios throws) on 401 — callers treat a 401 as anonymous, so the
 * error is intentionally not swallowed here.
 */
export async function getMe(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('/api/auth/me');
  return response.data;
}
