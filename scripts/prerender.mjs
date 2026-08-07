/*
 * Post-build step: renders the /temp route to static HTML and writes it to
 * dist/temp/index.html.
 *
 * GitHub Pages serves that file directly, so a crawler or an AI agent doing a
 * plain HTTP GET on closermetrix.com/temp receives the full page content
 * without executing any JavaScript. Browsers still boot the React app from the
 * same document and take over rendering.
 *
 * Run order (see package.json): vite build -> vite build --ssr -> this script.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')

const SITE = 'https://closermetrix.com'
const PATH = '/temp'
const TITLE = 'CloserMetrix — Turn Every Sales Call Into Business Evidence'
const DESCRIPTION =
  'The sales call is the biggest blind spot in your business. CloserMetrix automatically turns every recorded sales call into CRM updates, manager reports, weekly sales intelligence and a monthly Sales Integrity Audit.'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'CloserMetrix',
  applicationCategory: 'BusinessApplication',
  description: DESCRIPTION,
  url: `${SITE}${PATH}`,
  offers: {
    '@type': 'Offer',
    price: '1000',
    priceCurrency: 'USD',
    description: 'Unlimited call processing, CRM updates, weekly reports, monthly Integrity Audit.',
  },
  featureList: [
    'CRM Updates',
    'Call Notes',
    'Pain Points',
    'Goals',
    'Objections',
    'Next Steps',
    'Pipeline Updates',
    'Manager Notifications',
    'Weekly Reports',
    'Monthly Integrity Audit',
  ],
}

const { renderTemp } = await import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href)
const body = renderTemp()

let html = await readFile(resolve(dist, 'index.html'), 'utf8')

// Page-specific head: title, description, canonical, social cards, structured data.
const head = `
    <link rel="canonical" href="${SITE}${PATH}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="CloserMetrix" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${SITE}${PATH}" />
    <meta property="og:image" content="${SITE}/logo-full.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>`

html = html
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
  .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${DESCRIPTION}" />`)
  .replace('</head>', head)
  .replace('<div id="root"></div>', `<div id="prerender">${body}</div>\n    <div id="root"></div>`)

await mkdir(resolve(dist, 'temp'), { recursive: true })
await writeFile(resolve(dist, 'temp/index.html'), html, 'utf8')

console.log(`prerendered ${PATH} -> dist/temp/index.html (${(body.length / 1024).toFixed(1)} kB markup)`)
