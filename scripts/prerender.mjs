/*
 * Prerender registered routes to static HTML.
 *
 * Runs after `vite build` (client) and `vite build --ssr` (server bundle).
 * For each route it renders the React tree to a string, injects it into the
 * built index.html shell along with route-specific head tags, and writes
 * dist/<route>/index.html. Crawlers and AI agents that don't execute
 * JavaScript get the full page on a plain GET; browsers mount the SPA over it.
 *
 * Also writes dist/404.html so GitHub Pages serves the SPA shell for any
 * client-side route that has no static file of its own.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')

const SITE = 'https://closermetrix.com'

/* Per-route head. Anything absent falls back to the shell's own tags. */
const META = {
  '/': {
    title: 'CloserMetrix — Sales Integrity Audits for High-Ticket Teams',
    description:
      'Most companies bought a recorder. We built the reader. CloserMetrix reads every recorded sales call, writes what happened into your CRM, flags risky promises, and reports monthly on what your buyers are actually saying.',
    robots: 'index, follow',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Sales Integrity Audit',
      provider: {
        '@type': 'Organization',
        name: 'CloserMetrix',
        url: SITE,
        logo: `${SITE}/logo-full.png`,
      },
      serviceType: 'Sales call review and compliance flagging',
      description:
        'Every recorded sales call read end to end: CRM notes written, pipeline stage updated, objections and promises extracted, risky promises flagged with timestamps, and a monthly audit of what buyers actually said.',
      areaServed: 'US',
      audience: {
        '@type': 'BusinessAudience',
        name: 'High-ticket coaching and consulting companies',
      },
      offers: {
        '@type': 'Offer',
        price: '3.00',
        priceCurrency: 'USD',
        unitText: 'per call reviewed',
availability: 'https://schema.org/InStock',
      },
    },
  },
  /* Legal pages are prerendered so a buyer following the footer link gets
     real markup, but noindexed while their clauses are still pending. */
  '/privacy': {
    title: 'Privacy Policy — CloserMetrix',
    description: 'How CloserMetrix handles personal information.',
    robots: 'noindex, follow',
  },
  '/terms': {
    title: 'Terms of Service — CloserMetrix',
    description: 'What CloserMetrix delivers, what it costs, and what each side is responsible for.',
    robots: 'noindex, follow',
  },
  '/data-handling': {
    title: 'Data Handling — CloserMetrix',
    description:
      'What enters CloserMetrix, what we do with it, and what happens when you ask us to stop.',
    robots: 'noindex, follow',
  },
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function headFor(route, meta) {
  // GitHub Pages serves dist/<route>/index.html at /<route>/ and 301s the
  // bare path to it, so the trailing-slash form is what gets indexed.
  const url = route === '/' ? `${SITE}/` : `${SITE}${route}/`
  const image = `${SITE}/logo-full.png`
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="${escapeAttr(meta.robots)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:site_name" content="CloserMetrix" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ]
  if (meta.jsonLd) {
    // </script> inside JSON would close the tag early.
    const json = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')
    tags.push(`<script type="application/ld+json">${json}</script>`)
  }
  return tags.map((t) => `    ${t}`).join('\n')
}

function buildPage(shell, route, meta, appHtml) {
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${meta.title}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${escapeAttr(meta.description)}" />`
    )
    .replace('</head>', `${headFor(route, meta)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)

  // Asset URLs in the shell are root-absolute, so they resolve from /temp/ too.
  return html
}

const shellPath = resolve(dist, 'index.html')
if (!existsSync(shellPath)) {
  console.error('prerender: dist/index.html missing — run `vite build` first')
  process.exit(1)
}
const shell = readFileSync(shellPath, 'utf-8')

const { render, prerenderRoutes } = await import(resolve(root, 'dist-ssr/entry-server.js'))

for (const route of prerenderRoutes) {
  const meta = META[route]
  if (!meta) {
    console.error(`prerender: no META entry for ${route}`)
    process.exit(1)
  }

  const appHtml = render(route)
  const outDir = resolve(dist, route.replace(/^\//, ''))
  mkdirSync(outDir, { recursive: true })
  const outFile = resolve(outDir, 'index.html')
  writeFileSync(outFile, buildPage(shell, route, meta, appHtml))

  const kb = (Buffer.byteLength(appHtml) / 1024).toFixed(1)
  console.log(`prerender: ${route} -> ${outFile.replace(root + '/', '')} (${kb} kB of markup)`)
}

// SPA fallback for client-only routes (/how-it-works, /faq, /v1, deep links).
// Written from the untouched shell so those routes don't ship homepage copy.
writeFileSync(resolve(dist, '404.html'), shell)
console.log('prerender: dist/404.html (SPA fallback)')
