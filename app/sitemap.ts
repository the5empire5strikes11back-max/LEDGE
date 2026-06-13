import type { MetadataRoute } from 'next'

// Prod alias; override with NEXT_PUBLIC_APP_URL when a custom domain is added.
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledge-phi.vercel.app'

// Only public, indexable pages belong here — the app shell (/) redirects to
// /landing for logged-out visitors, and everything else is behind auth.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${BASE_URL}/landing`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`,   lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
