import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-4">
          <div className="bg-surface-raised border border-danger/20 rounded-xl p-8 max-w-lg mx-auto text-center">
            <h1 className="text-lg font-display font-semibold text-danger">
              Something went wrong
            </h1>
            <p className="text-sm text-content-secondary mt-2">
              The dashboard encountered an unexpected error.
            </p>

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 bg-surface border border-surface-border rounded-lg p-4 text-left">
                <summary className="cursor-pointer text-sm text-content-secondary mb-2">
                  Error Details (Development Mode)
                </summary>
                <pre className="text-xs text-danger whitespace-pre-wrap overflow-auto max-h-48">
                  {this.state.error && this.state.error.toString()}
                  {'\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
