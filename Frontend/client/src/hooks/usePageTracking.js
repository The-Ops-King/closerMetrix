/**
 * USE PAGE TRACKING HOOK
 *
 * Tracks client dashboard usage: session starts, page views, and time on page.
 * Sends data to /api/activity/* endpoints as fire-and-forget POSTs.
 *
 * Session ID is stored in sessionStorage — new tab = new session.
 * Uses fetch with keepalive for reliable tracking on tab close/navigation.
 *
 * Only tracks client views — skips admin mode.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Generate a UUID v4 (crypto.randomUUID or fallback).
 */
function generateSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Get or create a session ID in sessionStorage.
 * New tab = new sessionStorage = new session ID.
 */
function getSessionId() {
  const KEY = 'cmx_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = generateSessionId();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Extract the page name from a dashboard URL.
 * /d/:token/financial → 'financial'
 * /d/:token → 'overview' (root = overview)
 */
function extractPageName(pathname, token) {
  if (!token) return '';
  const prefix = `/d/${token}`;
  const rest = pathname.replace(prefix, '').replace(/^\//, '');
  return rest || 'overview';
}

/**
 * Send a tracking event. Fire-and-forget — errors are silently ignored.
 *
 * @param {string} endpoint - '/api/activity/session-start' or '/api/activity/page-view'
 * @param {object} body - Request body
 * @param {string} token - Client token for auth header
 */
function sendEvent(endpoint, body, token) {
  try {
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': token,
      },
      body: JSON.stringify(body),
      // Don't need response — fire and forget
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Silently ignore
  }
}

/**
 * Send a tracking event on tab close / page unload.
 * Uses fetch with keepalive: true instead of sendBeacon so we can
 * include the auth token in a header rather than a query parameter.
 */
function sendUnloadEvent(endpoint, body, token) {
  try {
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': token,
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Silently ignore
  }
}

/**
 * Hook: tracks page views, session starts, and time on page.
 * Call once in ClientDashboardLayout.
 */
export default function usePageTracking() {
  const { token, mode } = useAuth();
  const { token: urlToken } = useParams();
  const location = useLocation();

  // Track the timestamp when the current page was entered
  const pageEnteredAt = useRef(null);
  const currentPage = useRef(null);
  const sessionStarted = useRef(false);

  const clientToken = token || urlToken;

  // Skip tracking for admin mode
  const shouldTrack = mode === 'client' || mode === 'partner';

  // Send session-start on first mount
  useEffect(() => {
    if (!shouldTrack || !clientToken || sessionStarted.current) return;
    sessionStarted.current = true;

    const sessionId = getSessionId();
    sendEvent('/api/activity/session-start', { sessionId }, clientToken);
  }, [shouldTrack, clientToken]);

  // Track page views on route changes
  useEffect(() => {
    if (!shouldTrack || !clientToken) return;

    const sessionId = getSessionId();
    const page = extractPageName(location.pathname, urlToken);

    // Calculate duration on previous page
    const now = Date.now();
    let durationSeconds = 0;
    if (pageEnteredAt.current && currentPage.current) {
      durationSeconds = Math.round((now - pageEnteredAt.current) / 1000);
    }

    // Send page_view event (includes duration for the page being left)
    sendEvent('/api/activity/page-view', {
      sessionId,
      page,
      durationSeconds,
    }, clientToken);

    // Update refs for the new page
    pageEnteredAt.current = now;
    currentPage.current = page;
  }, [location.pathname, shouldTrack, clientToken, urlToken]);

  // Handle tab close / visibility change — send final page duration
  useEffect(() => {
    if (!shouldTrack || !clientToken) return;

    function handleUnload() {
      if (!pageEnteredAt.current || !currentPage.current) return;

      const durationSeconds = Math.round((Date.now() - pageEnteredAt.current) / 1000);
      const sessionId = getSessionId();

      sendUnloadEvent('/api/activity/page-view', {
        sessionId,
        page: currentPage.current,
        durationSeconds,
      }, clientToken);
    }

    // visibilitychange fires more reliably than beforeunload on mobile
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        handleUnload();
      }
    }

    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shouldTrack, clientToken]);
}
