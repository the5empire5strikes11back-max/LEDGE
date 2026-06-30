import type { MetadataRoute } from 'next'

// Prod alias; override with NEXT_PUBLIC_APP_URL when a custom domain is added.
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledge-phi.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`,   lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
