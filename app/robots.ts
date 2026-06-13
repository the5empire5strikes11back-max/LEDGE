import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledge-phi.vercel.app'

// Let crawlers reach the public pages; keep them out of the API and auth flows.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
