import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // In production, send to telemetry/logging service if configured
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg-color)',
          color: 'var(--text-main)',
        }}>
          <div className="glass-panel" style={{
            maxWidth: '480px',
            textAlign: 'center',
            borderColor: 'var(--danger-color)',
            padding: '36px 28px',
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '16px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              marginBottom: '20px',
              color: 'var(--danger-color)',
            }}>
              <AlertOctagon size={48} />
            </div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>Something went wrong.</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '0.95rem' }}>
              An unexpected error occurred in the control tower interface. Please reload the dashboard to resume operations.
            </p>
            <button
              onClick={this.handleReload}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px 20px' }}
              aria-label="Reload the dashboard"
            >
              <RefreshCw size={18} /> Reload the dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
