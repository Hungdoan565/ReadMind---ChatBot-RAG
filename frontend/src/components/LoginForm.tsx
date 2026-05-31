import { useState, useCallback, type FormEvent } from 'react';
import { LogIn, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import type { LoginRequest } from '../types';

interface LoginFormProps {
  onSubmit: (data: LoginRequest) => Promise<void>;
  onSwitchToRegister?: () => void;
  onSwitchToForgot?: () => void;
}

export function LoginForm({ onSubmit, onSwitchToRegister, onSwitchToForgot }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!email.trim() || !password) return;

      setIsLoading(true);
      setError(null);

      try {
        await onSubmit({ email: email.trim(), password });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, onSubmit],
  );

  return (
    <div className="w-full">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] mb-4">
        <LogIn className="w-5 h-5 text-[var(--accent)]" />
        Đăng nhập
      </h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="ban@example.com"
              required
              disabled={isLoading}
              className="w-full glass-border bg-[var(--sidebar-bg-light)] rounded-lg pl-9 pr-3 py-2 text-sm
                         text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
                         focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                         disabled:opacity-50 transition-all duration-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Mật khẩu</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              required
              disabled={isLoading}
              className="w-full glass-border bg-[var(--sidebar-bg-light)] rounded-lg pl-9 pr-3 py-2 text-sm
                         text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
                         focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                         disabled:opacity-50 transition-all duration-200"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!email.trim() || !password || isLoading}
          className="w-full glass-border bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                     text-white rounded-lg px-3 py-2 text-sm font-medium
                     transition-all duration-200 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed
                     flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang đăng nhập...</span>
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập</span>
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)] text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(onSwitchToRegister || onSwitchToForgot) && (
        <div className="mt-4 flex flex-col gap-1.5 text-xs">
          {onSwitchToForgot && (
            <button
              type="button"
              onClick={onSwitchToForgot}
              className="text-[var(--accent)] hover:underline self-start"
            >
              Quên mật khẩu?
            </button>
          )}
          {onSwitchToRegister && (
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] self-start"
            >
              Chưa có tài khoản? <span className="text-[var(--accent)]">Đăng ký</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
