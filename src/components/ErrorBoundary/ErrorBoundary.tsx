import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'
import { Button } from '../ui'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled app error', error, info)
  }

  private handleReload = () => {
    window.location.reload()
  }

  override render() {
    if (this.state.error) {
      return (
        <main className={styles.appShell}>
          <section className={styles.recorderStage} aria-labelledby="error-title">
            <header className={styles.topbar}>
              <div>
                <p className={styles.eyebrow}>Runtime error</p>
                <h1 className={styles.title} id="error-title">Recorder unavailable</h1>
              </div>
            </header>
            <p className={styles.errorBanner}>{this.state.error.message}</p>
            <Button variant="primary" onClick={this.handleReload}>
              Reload
            </Button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
