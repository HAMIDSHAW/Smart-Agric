import { Component } from 'react'

// Catches uncaught errors anywhere in the component tree below it and shows
// a recoverable screen instead of letting React unmount everything (which is
// what was causing the app to go to a blank white page).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('SmartAgri caught a render error:', error, info)
  }

  handleReload = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#FAFAF7', padding: '2rem', textAlign: 'center', fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌿</div>
            <h1 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              SmartAgri hit an unexpected error on this page. You can go back to the homepage and try again.
            </p>
            <button onClick={this.handleReload} style={{
              background: '#14532D', color: 'white', padding: '12px 28px',
              borderRadius: 10, fontWeight: 600, fontSize: '0.95rem',
              border: 'none', cursor: 'pointer',
            }}>
              Back to Homepage
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
