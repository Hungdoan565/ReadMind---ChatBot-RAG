import { useState, useCallback, type FormEvent } from 'react';
import { UserPlus, Mail, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { RegisterRequest } from '../types';

interface RegisterFormProps {
  onSubmit: (data: RegisterRequest) => Promise<void>;
  onSwitchToLogin?: () => void;
  onSuccess?: () => void;
}

export function RegisterForm({ onSubmit, onSwitchToLogin, onSuccess }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!email.trim() || !password) return;

      setIsLoading(true);
      setError(null);

      try {
        await onSubmit({ email: email.trim(), password });
        setIsDone(true);
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Đăng ký thất bại');
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, onSubmit, onSuccess],
  );

  return (
    <div className="w-full">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] mb-4">
        <UserPlus className="w-5 h-5 text-[var(--accent)]" />
        Đăng ký
      </h2>

      {isDone ? (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)] text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Tạo tài khoản thành công. Bạn có thể đăng nhập ngay bây giờ.</span>
        </div>
      ) : (
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
                <span>Đang đăng ký...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Đăng ký</span>
              </>
            )}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)] text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {onSwitchToLogin && (
        <div className="mt-4 text-xs">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Đã có tài khoản? <span className="text-[var(--accent)]">Đăng nhập</span>
          </button>
        </div>
      )}
    </div>
  );
}
