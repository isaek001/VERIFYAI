import { Component } from "react";

// Catches render-time failures — most commonly a lazy page chunk that can
// no longer be fetched after a redeploy — so the user gets a recovery UI
// instead of a blank screen.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state" role="alert">
          <div className="empty-icon">!</div>
          <strong>Something went wrong</strong>
          <p className="muted">The page could not be displayed. Reload to try again.</p>
          <div className="head-actions">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn ghost" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
