interface DocumentLogoIconProps {
  size?: number;
  className?: string;
}

export function DocumentLogoIcon({ size = 32, className }: DocumentLogoIconProps) {
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
      <path
        d="M16 8H38L50 20V56H16V8Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M38 8V20H50"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M24 34H42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 42H40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
