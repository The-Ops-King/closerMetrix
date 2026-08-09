import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import HomePage from './HomePage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import DataHandlingPage from './pages/DataHandlingPage'
import { DemoModalProvider } from './hooks/useDemoModal'

/*
 * Static render for crawlers and AI agents that don't execute JavaScript.
 *
 * Deliberately renders a reduced tree: Navbar + page + Footer. Aurora and
 * ShapeBlur are WebGL canvases with nothing to read, and App's content is
 * gated behind an isLoaded effect that never fires on the server. The client
 * bundle mounts the full app over this markup via createRoot.
 */
const routes = {
  '/': HomePage,
  '/privacy': PrivacyPage,
  '/terms': TermsPage,
  '/data-handling': DataHandlingPage,
}

export function render(route) {
  const Page = routes[route]
  if (!Page) throw new Error(`No prerender route registered for ${route}`)

  return renderToString(
    <MemoryRouter initialEntries={[route]}>
      <DemoModalProvider>
        <div className="app">
          <Navbar />
          <main id="main">
            <Page />
          </main>
          <Footer />
        </div>
      </DemoModalProvider>
    </MemoryRouter>
  )
}

export const prerenderRoutes = Object.keys(routes)
