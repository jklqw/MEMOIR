import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button.js';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Redacted error logging — never log potential memory plaintext or state
    console.error('Memoir UI Error Boundary caught an exception:', {
      name: error.name,
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas text-ink text-center"
        >
          <div className="w-full max-w-md p-8 bg-surface border border-border rounded-lg shadow-sm space-y-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-6 h-6 stroke-[1.5]" />
            </div>

            <div className="space-y-2">
              <h1 className="font-serif text-2xl font-semibold text-ink">A Quiet Interruption</h1>
              <p className="text-xs text-ink-muted leading-relaxed">
                An unexpected interface error interrupted this view. Your encrypted diary entries
                and vault keys remain secure.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left text-[11px] font-mono text-ink-muted bg-canvas p-3 rounded border border-border overflow-x-auto max-h-32">
                <summary className="cursor-pointer font-sans font-medium text-xs text-ink mb-1">
                  Technical Diagnostics (Redacted)
                </summary>
                <p className="text-destructive font-semibold">
                  {this.state.error.name}: {this.state.error.message}
                </p>
              </details>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="secondary" size="sm" onClick={this.handleReset}>
                Try Again
              </Button>
              <Button variant="primary" size="sm" onClick={this.handleReload} className="gap-2">
                <RefreshCw className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>Reload Application</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
