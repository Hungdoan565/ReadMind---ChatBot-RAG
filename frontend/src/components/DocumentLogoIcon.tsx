import { useId } from 'react';

interface DocumentLogoIconProps {
  size?: number;
  className?: string;
}

export function DocumentLogoIcon({ size = 32, className }: DocumentLogoIconProps) {
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C153F4" />
          <stop offset="100%" stopColor="#55C8F7" />
        </linearGradient>
      </defs>

      <path
        d="M16 8H38L50 20V56H16V8Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M38 8V20H50"
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M24 34H42" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" />
      <path d="M24 42H40" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
