import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function Skeleton({ 
  className = '', 
  width, 
  height,
  rounded = 'md'
}: SkeletonProps) {
  const roundedClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    full: 'rounded-full'
  };

  return (
    <div 
      className={`skeleton ${roundedClasses[rounded]} ${className}`}
      style={{ 
        width: width ? (typeof width === 'number' ? `${width}px` : width) : '100%',
        height: height ? (typeof height === 'number' ? `${height}px` : height) : '1rem'
      }}
    />
  );
}

// Message skeleton for loading states
export function MessageSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-3"
    >
      {/* Avatar skeleton */}
      <Skeleton width={32} height={32} rounded="full" />
      
      {/* Content skeleton */}
      <div className="flex-1 space-y-2 max-w-[75%]">
        <Skeleton width="60%" height={16} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="40%" height={16} />
      </div>
    </motion.div>
  );
}
