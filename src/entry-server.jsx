import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import TempPage from './TempPage'
import { DemoModalProvider } from './hooks/useDemoModal'

/*
 * Static render of the /temp page. Used by scripts/prerender.mjs at build time
 * so crawlers and AI agents that don't execute JavaScript still get the full
 * page content in the initial HTML response.
 *
 * The WebGL background layers (Aurora, ShapeBlur) are deliberately omitted —
 * they're decorative and carry no content.
 */
export function renderTemp() {
  return renderToStaticMarkup(
    <StaticRouter location="/temp">
      <DemoModalProvider>
        <div className="app">
          <Navbar />
          <main>
            <TempPage />
          </main>
          <Footer />
        </div>
      </DemoModalProvider>
    </StaticRouter>
  )
}
