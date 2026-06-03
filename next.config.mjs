import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@anthropic-ai/sdk'],
}

export default withSentryConfig(nextConfig, {
  // Suppress verbose Sentry build output
  silent: true,

  // Upload source maps so stack traces show real file/line numbers
  widenClientFileUpload: true,

  // Tree-shake Sentry logger in production bundle
  disableLogger: true,

  // Hide source maps from browser devtools
  hideSourceMaps: true,

  // Don't block the build if source map upload fails
  // (requires SENTRY_AUTH_TOKEN — without it, maps just won't upload)
  errorHandler(err, invokeErr, compilation) {
    compilation.warnings.push('Sentry source map upload failed: ' + err.message)
  },
})
