/**
 * Server-side error logger.
 *
 * - In production: forwards to Sentry (when DSN is set)
 * - Always: console.error so Vercel function logs capture it too
 *
 * Usage:
 *   import { logError } from '@/lib/logger'
 *   logError(err, { context: 'bets:POST', userId })
 */
import * as Sentry from '@sentry/nextjs'

interface ErrorContext {
  [key: string]: string | number | boolean | undefined | null
}

export function logError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error))

  console.error(`[${context?.context ?? 'unknown'}]`, err.message, context ?? '')

  if (process.env.NODE_ENV === 'production') {
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([k, v]) => {
          if (v != null) scope.setTag(k, String(v))
        })
      }
      Sentry.captureException(err)
    })
  }
}

export function logMessage(message: string, context?: ErrorContext): void {
  console.log(`[${context?.context ?? 'info'}]`, message)

  if (process.env.NODE_ENV === 'production') {
    Sentry.captureMessage(message, 'info')
  }
}
