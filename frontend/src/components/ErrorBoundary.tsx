import { Component } from 'react'
import type { ReactNode } from 'react'

type State = { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('UI error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center">
          <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1>Kuch galat ho gaya</h1>
            <p style={{ color: 'var(--muted)' }}>{this.state.error.message}</p>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload karein
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
