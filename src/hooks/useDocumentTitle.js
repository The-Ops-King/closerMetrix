import { useEffect } from 'react'

/*
 * The prerendered HTML carries the right <title>, but client-side routing
 * never updated it — every SPA navigation kept the homepage title, so a
 * buyer forwarding /data-handling produced a preview card for the homepage.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}

export default useDocumentTitle
