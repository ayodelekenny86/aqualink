import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
    
    // Send to error reporting service if available
    if (typeof window !== 'undefined' && window.reportError) {
      window.reportError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError.bind(this));
      }
      return (
        <div className="error-boundary panel" role="alert">
          <div className="error-icon" aria-hidden="true">⚠</div>
          <h2>Something went wrong</h2>
          <p>We're sorry, but an unexpected error occurred.</p>
          <details style={{ marginTop: '16px', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Error details</summary>
            <pre style={{ 
              marginTop: '12px', 
              padding: '12px', 
              background: '#f5f5f5', 
              borderRadius: '4px', 
              fontSize: '11px',
              overflow: 'auto',
              maxHeight: '200px'
            }}>
              {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button 
            className="primary-button" 
            onClick={this.resetError.bind(this)}
            style={{ marginTop: '16px' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }

  resetError() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }
}

export default ErrorBoundary;