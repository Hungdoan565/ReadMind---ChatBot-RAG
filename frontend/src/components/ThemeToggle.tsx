import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-10 h-10 rounded-lg flex items-center justify-center
                 bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)]
                 border border-[var(--border-primary)]
                 transition-all duration-200 ease-out
                 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        initial={false}
        animate={{
          rotate: isDark ? 180 : 0,
          scale: isDark ? 0.8 : 1,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="absolute"
      >
        {isDark ? (
          <Moon className="w-5 h-5 text-[var(--text-secondary)]" />
        ) : (
          <Sun className="w-5 h-5 text-[var(--text-secondary)]" />
        )}
      </motion.div>
    </button>
  );
}
