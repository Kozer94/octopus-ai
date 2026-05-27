import { Component } from 'react';
import { notifyReactError } from '../services/runtimeTelemetry.js';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
    });
    notifyReactError(error, errorInfo);
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0d1117',
          color: '#e6edf3',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🐙</div>
          <h1 style={{ fontSize: 24, marginBottom: 16, color: '#ff7b72' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#8b949e', marginBottom: 24, maxWidth: 500 }}>
            Octopus AI encountered an unexpected error. Your work may not have been saved.
            Please refresh the page or try again.
          </p>
          {this.state.error && (
            <details style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              padding: '16px',
              marginBottom: 24,
              maxWidth: 600,
              textAlign: 'left',
            }}>
              <summary style={{ cursor: 'pointer', color: '#58a6ff', marginBottom: 8 }}>
                Error Details
              </summary>
              <pre style={{
                fontSize: 12,
                color: '#ff7b72',
                overflow: 'auto',
                maxHeight: 200,
                margin: 0,
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                background: '#238636',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                padding: '10px 20px',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#30363d',
                border: 'none',
                borderRadius: 6,
                color: '#e6edf3',
                padding: '10px 20px',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
