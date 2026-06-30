'use client'

/**
 * Global error boundary — catches unhandled errors in the root layout.
 * Sentry captures the error automatically when configured.
 */
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body style={{ background: '#0A0A0B', color: '#fff', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</p>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '1.5rem' }}>
            {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred.'}
          </p>
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1.5rem', background: '#FFFFFF', color: '#0A0A0B', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
