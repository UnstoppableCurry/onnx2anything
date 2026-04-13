import React from 'react';
import { cn } from '../../utils/cn';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  indeterminate?: boolean;
  showLabel?: boolean;
  animated?: boolean;
}

const Progress = ({
  className,
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  indeterminate = false,
  showLabel = false,
  animated = true,
  ...props
}: ProgressProps) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const sizes = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const variants = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-destructive',
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-muted',
          sizes[size]
        )}
      >
        {indeterminate ? (
          <div
            className={cn(
              'absolute inset-0 rounded-full',
              variants[variant],
              'animate-indeterminate'
            )}
            style={{
              width: '30%',
              animation: 'indeterminate 1.5s ease-in-out infinite',
            }}
          />
        ) : (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 ease-out',
              variants[variant],
              animated && percentage > 0 && percentage < 100 && 'animate-pulse'
            )}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      {showLabel && !indeterminate && (
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(percentage)}%</span>
          <span>
            {value} / {max}
          </span>
        </div>
      )}
      <style>{`
        @keyframes indeterminate {
          0% {
            left: -30%;
          }
          50% {
            left: 50%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  );
};

interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
}

const CircularProgress = ({
  className,
  value,
  max = 100,
  size = 48,
  strokeWidth = 4,
  variant = 'default',
  showLabel = true,
  ...props
}: CircularProgressProps) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const variants = {
    default: 'text-primary',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-destructive',
  };

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      {...props}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="text-muted"
          stroke="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn('transition-all duration-300 ease-out', variants[variant])}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-medium">{Math.round(percentage)}%</span>
      )}
    </div>
  );
};

interface StepProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: { label: string; description?: string }[];
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
}

const StepProgress = ({
  className,
  steps,
  currentStep,
  orientation = 'horizontal',
  ...props
}: StepProgressProps) => {
  const isVertical = orientation === 'vertical';

  return (
    <div
      className={cn(
        isVertical ? 'flex-col space-y-4' : 'flex items-start space-x-4',
        className
      )}
      {...props}
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isPending = index > currentStep;

        return (
          <div
            key={index}
            className={cn(
              'flex items-start gap-3',
              isVertical ? 'w-full' : 'flex-1'
            )}
          >
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                isCompleted && 'bg-green-500 text-white',
                isCurrent && 'bg-primary text-primary-foreground',
                isPending && 'bg-muted text-muted-foreground'
              )}
            >
              {isCompleted ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.description}
                </p>
              )}
            </div>
            {!isVertical && index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mt-4 transition-colors',
                  isCompleted ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export { Progress, CircularProgress, StepProgress };
