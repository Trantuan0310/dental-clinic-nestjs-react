import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback render. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Wrapped component name for logging. */
  componentName?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary — catches render-time errors and shows a graceful fallback
 * instead of crashing the whole app. Use around feature root or any subtree
 * that has independent failure modes (e.g. dashboards, charts).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.componentName ?? 'ErrorBoundary';
    console.error(`[${label}] caught error:`, error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return <DefaultErrorFallback error={error} onRetry={this.reset} />;
  }
}

// ErrorBoundary renders this local fallback; it is not a separate refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function DefaultErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
      <div
        role="alert"
        className="m-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/30"
      >
        <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
            {t('common.error')}
          </h2>
          <p className="mt-1 max-w-md text-sm text-red-600 dark:text-red-300">
            {error.message || t('common.error')}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-surface-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('common.retry')}
        </button>
      </div>
    );
  }
