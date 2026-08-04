import { eq } from 'drizzle-orm'
import { recipes, users } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const appUrl = config.public.appUrl.replace(/\/$/, '')
  const db = useDrizzle()
  if (!db) {
    setHeader(event, 'content-type', 'application/xml; charset=utf-8')
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
  }

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600, s-maxage=3600')

  const publicRecipes = await db
    .select({
      slug: recipes.slug,
      updatedAt: recipes.updatedAt,
      username: users.username,
    })
    .from(recipes)
    .innerJoin(users, eq(recipes.ownerId, users.id))
    .where(eq(recipes.visibility, 'public'))
    .orderBy(recipes.updatedAt)
    .limit(5000)

  interface SitemapUrl {
    loc: string
    lastmod?: string
    priority: string
    changefreq: string
  }

  const staticUrls: SitemapUrl[] = [
    { loc: `${appUrl}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${appUrl}/explore`, priority: '0.9', changefreq: 'hourly' },
  ]

  const recipeUrls: SitemapUrl[] = publicRecipes.map((r) => ({
    loc: `${appUrl}/${r.username}/${r.slug}`,
    lastmod: r.updatedAt.toISOString().split('T')[0],
    priority: '0.7',
    changefreq: 'weekly',
  }))

  const allUrls = [...staticUrls, ...recipeUrls]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return xml
})
