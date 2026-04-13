import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps extends HTMLAttributes<HTMLButtonElement> {
  text: string;
  copied?: boolean;
  onCopy?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    { className, text, copied = false, onCopy, size = 'md', ...props },
    ref
  ) => {
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        onCopy?.();
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    const sizes = {
      sm: 'w-6 h-6',
      md: 'w-8 h-8',
      lg: 'w-10 h-10',
    };

    const iconSizes = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5',
    };

    return (
      <button
        ref={ref}
        onClick={handleCopy}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
          sizes[size],
          className
        )}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        {...props}
      >
        {copied ? (
          <Check className={cn(iconSizes[size], 'text-green-500')} />
        ) : (
          <Copy className={cn(iconSizes[size], 'text-muted-foreground')} />
        )}
      </button>
    );
  }
);

CopyButton.displayName = 'CopyButton';

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  copyable?: boolean;
  filename?: string;
}

const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(
  (
    {
      className,
      code,
      language,
      showLineNumbers = false,
      copyable = true,
      filename,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const lines = code.trim().split('\n');

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-lg bg-muted overflow-hidden',
          className
        )}
        {...props}
      >
        {(filename || copyable) && (
          <div className="flex items-center justify-between px-4 py-2 bg-muted-foreground/5 border-b border-border">
            {filename && (
              <span className="text-xs text-muted-foreground font-mono">
                {filename}
              </span>
            )}
            {copyable && (
              <CopyButton
                text={code}
                copied={copied}
                onCopy={handleCopy}
                size="sm"
                className="ml-auto"
              />
            )}
          </div>
        )}
        <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
          <code>
            {showLineNumbers ? (
              <div className="table w-full">
                {lines.map((line, i) => (
                  <div key={i} className="table-row">
                    <span className="table-cell text-muted-foreground select-none pr-4 text-right w-12">
                      {i + 1}
                    </span>
                    <span className="table-cell">{line}</span>
                  </div>
                ))}
              </div>
            ) : (
              code
            )}
          </code>
        </pre>
      </div>
    );
  }
);

CodeBlock.displayName = 'CodeBlock';

export { CopyButton, CodeBlock };
