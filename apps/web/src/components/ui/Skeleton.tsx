import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: 'default' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      className,
      variant = 'default',
      animation = 'pulse',
      style,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'bg-muted';

    const variants = {
      default: 'rounded-md',
      circular: 'rounded-full',
      rectangular: 'rounded-none',
    };

    const animations = {
      pulse: 'animate-pulse',
      wave: 'animate-wave',
      none: '',
    };

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], animations[animation], className)}
        style={style}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lineHeight?: number;
  lastLineWidth?: string;
}

const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(
  (
    {
      className,
      lines = 3,
      lineHeight = 16,
      lastLineWidth = '60%',
      ...props
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full"
            style={{
              height: lineHeight,
              width: i === lines - 1 ? lastLineWidth : '100%',
            }}
          />
        ))}
      </div>
    );
  }
);

SkeletonText.displayName = 'SkeletonText';

export { Skeleton, SkeletonText };
