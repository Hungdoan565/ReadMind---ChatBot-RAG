import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import type { LoginRequest, RegisterRequest, ForgotPasswordRequest } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (data: LoginRequest) => Promise<void>;
  onRegister: (data: RegisterRequest) => Promise<void>;
  onForgotPassword: (data: ForgotPasswordRequest) => Promise<void>;
}

type AuthMode = 'login' | 'register' | 'forgot';

/**
 * Modal host for the auth forms (login / register / forgot password).
 *
 * Follows the shared ConfirmDialog overlay pattern (AnimatePresence + glass
 * surface + blurred backdrop). The active form is selected by an internal
 * `mode`, which resets to 'login' each time the modal opens.
 */
export function AuthModal({ open, onClose, onLogin, onRegister, onForgotPassword }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  // Reset to the login form whenever the modal transitions to open.
  useEffect(() => {
    if (open) setMode('login');
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className="relative glass-surface rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-[var(--border-primary)]"
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="absolute top-3 right-3 p-1 rounded-lg text-[var(--text-tertiary)]
                         hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {mode === 'login' && (
              <LoginForm
                onSubmit={async (data) => {
                  await onLogin(data);
                  onClose();
                }}
                onSwitchToRegister={() => setMode('register')}
                onSwitchToForgot={() => setMode('forgot')}
              />
            )}

            {mode === 'register' && (
              <RegisterForm
                onSubmit={onRegister}
                onSwitchToLogin={() => setMode('login')}
                onSuccess={() => setMode('login')}
              />
            )}

            {mode === 'forgot' && (
              <ForgotPasswordForm
                onSubmit={onForgotPassword}
                onSwitchToLogin={() => setMode('login')}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
