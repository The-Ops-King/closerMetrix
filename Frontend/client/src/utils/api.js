/**
 * API CLIENT
 *
 * Thin wrapper around fetch for making API calls with proper auth headers.
 * All dashboard API calls go through this module.
 *
 * Auth headers are injected based on the current access mode:
 *   - Client: X-Client-Token
 *   - Admin: X-Admin-Key (+ optional X-View-Client-Id for viewing client dashboards)
 *   - Partner: X-Partner-Token
 */

const BASE_URL = '/api';

/**
 * Make an authenticated API request.
 *
 * @param {string} path - API path (e.g. '/dashboard/overview')
 * @param {object} [options] - Fetch options
 * @param {object} [options.params] - Query parameters
 * @param {string} [options.method] - HTTP method (default GET)
 * @param {object} [options.body] - Request body (for POST/PUT)
 * @param {string} [options.token] - Client or partner token
 * @param {string} [options.adminKey] - Admin API key
 * @param {string} [options.viewClientId] - Client ID for admin view mode (sets X-View-Client-Id)
 * @returns {Promise<object>} Parsed JSON response
 */
export async function apiRequest(path, options = {}) {
  const { params, method = 'GET', body, token, adminKey, viewClientId } = options;

  // Build URL with query params
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, value);
    });
  }

  // Build headers
  const headers = { 'Content-Type': 'application/json' };

  // Client token auth
  if (token) headers['X-Client-Token'] = token;

  // Admin key auth (explicit or from sessionStorage)
  if (adminKey) {
    headers['X-Admin-Key'] = adminKey;
  } else if (!token) {
    // Fallback: check sessionStorage for admin key
    const storedAdminKey = sessionStorage.getItem('adminApiKey');
    if (storedAdminKey) headers['X-Admin-Key'] = storedAdminKey;
  }

  // Admin view mode: tells the server which client's dashboard to show
  if (viewClientId) {
    headers['X-View-Client-Id'] = viewClientId;
    // Also ensure admin key is set (from sessionStorage if not explicit)
    if (!headers['X-Admin-Key']) {
      const storedAdminKey = sessionStorage.getItem('adminApiKey');
      if (storedAdminKey) headers['X-Admin-Key'] = storedAdminKey;
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Convenience: GET request with query params.
 */
export function apiGet(path, params, authOptions = {}) {
  return apiRequest(path, { params, ...authOptions });
}

/**
 * Convenience: POST request with body.
 */
export function apiPost(path, body, authOptions = {}) {
  return apiRequest(path, { method: 'POST', body, ...authOptions });
}

/**
 * Convenience: PUT request with body.
 */
export function apiPut(path, body, authOptions = {}) {
  return apiRequest(path, { method: 'PUT', body, ...authOptions });
}

/**
 * Convenience: PATCH request with body.
 */
export function apiPatch(path, body, authOptions = {}) {
  return apiRequest(path, { method: 'PATCH', body, ...authOptions });
}

/**
 * Convenience: DELETE request.
 */
export function apiDelete(path, authOptions = {}) {
  return apiRequest(path, { method: 'DELETE', ...authOptions });
}
