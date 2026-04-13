import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'primary' | 'secondary' | 'white';
  label?: string;
}

const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  (
    { className, size = 'md', variant = 'default', label, ...props },
    ref
  ) => {
    const sizes = {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
      xl: 'w-12 h-12',
    };

    const variants = {
      default: 'text-muted-foreground',
      primary: 'text-primary',
      secondary: 'text-secondary',
      white: 'text-white',
    };

    return (
      <div
        ref={ref}
        role="status"
        className={cn('inline-flex items-center gap-2', className)}
        {...props}
      >
        <svg
          className={cn('animate-spin', sizes[size], variants[variant])}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        {label && (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
        <span className="sr-only">{label || 'Loading...'}</span>
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';

interface FullPageSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const FullPageSpinner = forwardRef<HTMLDivElement, FullPageSpinnerProps>(
  ({ className, message = 'Loading...', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'fixed inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-50',
          className
        )}
        {...props}
      >
        <Spinner size="xl" variant="primary" />
        {message && (
          <p className="mt-4 text-sm text-muted-foreground animate-pulse">
            {message}
          </p>
        )}
      </div>
    );
  }
);

FullPageSpinner.displayName = 'FullPageSpinner';

export { Spinner, FullPageSpinner };
