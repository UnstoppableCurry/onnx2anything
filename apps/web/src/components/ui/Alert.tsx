import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';
import {
  CheckCircle,
  Info,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

export type AlertVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const iconMap: Record<AlertVariant, ReactNode> = {
  default: <Info className="h-5 w-5" />,
  destructive: <XCircle className="h-5 w-5" />,
  success: <CheckCircle className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
};

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant = 'default',
      title,
      icon,
      dismissible = false,
      onDismiss,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11';

    const variants = {
      default: 'bg-background text-foreground border-border',
      destructive:
        'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
      success:
        'border-green-500/50 text-green-700 dark:text-green-300 dark:border-green-500/30 bg-green-50/50 dark:bg-green-900/10 [&>svg]:text-green-600',
      warning:
        'border-yellow-500/50 text-yellow-800 dark:text-yellow-300 dark:border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-900/10 [&>svg]:text-yellow-600',
      info: 'border-blue-500/50 text-blue-700 dark:text-blue-300 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10 [&>svg]:text-blue-600',
    };

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(baseStyles, variants[variant], className)}
        {...props}
      >
        {icon || iconMap[variant]}
        <div className="flex-1">
          {title && (
            <h5 className="mb-1 font-medium leading-none tracking-tight">
              {title}
            </h5>
          )}
          {children && (
            <div className="text-sm leading-relaxed opacity-90">{children}</div>
          )}
        </div>
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Dismiss"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

Alert.displayName = 'Alert';

interface AlertDescriptionProps extends HTMLAttributes<HTMLDivElement> {}

const AlertDescription = forwardRef<HTMLDivElement, AlertDescriptionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription };
