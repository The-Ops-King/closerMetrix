/**
 * AUTH CONTEXT
 *
 * Stores the authenticated client/admin/partner state.
 * Three access modes:
 *   1. Client: token from URL → resolves to client_id + tier
 *   2. Admin: API key from sessionStorage → full access
 *   3. Partner: partner token from URL → assigned client_ids
 *
 * Admin view mode:
 *   When an admin views a specific client's dashboard, the context
 *   stores the viewed client's info (adminViewClientId, etc.).
 *   API calls use X-Admin-Key + X-View-Client-Id to authenticate.
 *
 * This context is populated on initial load and consumed by:
 *   - Sidebar (which pages to show)
 *   - API calls (token injection)
 *   - Tier checks (feature gating)
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

/**
 * Auth state shape:
 * {
 *   mode: 'client' | 'admin' | 'partner' | null,
 *   token: string | null,
 *   clientId: string | null,
 *   companyName: string | null,
 *   tier: 'basic' | 'insight' | 'executive' | null,
 *   closers: Array<{ closer_id: string, name: string }>,
 *   isAuthenticated: boolean,
 *   isLoading: boolean,
 *   error: string | null,
 *   adminViewClientId: string | null,    — set when admin is viewing a client's dashboard
 *   adminViewCompanyName: string | null,
 *   adminViewTier: string | null,
 *   adminViewClosers: Array,
 * }
 */

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    mode: null,
    token: null,
    clientId: null,
    companyName: null,
    tier: null,
    closers: [],
    isAuthenticated: false,
    isLoading: true,
    error: null,
    // Admin view mode fields
    adminViewClientId: null,
    adminViewCompanyName: null,
    adminViewTier: null,
    adminViewClosers: [],
  });

  /**
   * Validate a client access token against the API.
   * Called when the app loads at /d/:token
   */
  const validateClientToken = useCallback(async (token) => {
    setAuth((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch(`/api/auth/validate?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        throw new Error('Invalid or expired access link');
      }
      const data = await res.json();
      setAuth({
        mode: 'client',
        token,
        clientId: data.client_id,
        companyName: data.company_name,
        tier: data.plan_tier,
        closers: data.closers || [],
        isAuthenticated: true,
        isLoading: false,
        error: null,
        adminViewClientId: null,
        adminViewCompanyName: null,
        adminViewTier: null,
        adminViewClosers: [],
      });
      return true;
    } catch (err) {
      setAuth((prev) => ({
        ...prev,
        isAuthenticated: false,
        isLoading: false,
        error: err.message,
      }));
      return false;
    }
  }, []);

  /**
   * Authenticate as admin with API key.
   * Called from the admin login page.
   */
  const loginAsAdmin = useCallback((apiKey) => {
    // Store in sessionStorage so it persists across page refreshes but not browser close
    sessionStorage.setItem('adminApiKey', apiKey);
    setAuth({
      mode: 'admin',
      token: null, // Admin doesn't use client tokens
      clientId: null,
      companyName: null,
      tier: 'executive', // Admin sees everything
      closers: [],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      adminViewClientId: null,
      adminViewCompanyName: null,
      adminViewTier: null,
      adminViewClosers: [],
    });
  }, []);

  /**
   * Check if admin is already authenticated (page refresh).
   */
  const checkAdminSession = useCallback(() => {
    const apiKey = sessionStorage.getItem('adminApiKey');
    if (apiKey) {
      loginAsAdmin(apiKey);
      return true;
    }
    setAuth((prev) => ({ ...prev, isLoading: false }));
    return false;
  }, [loginAsAdmin]);

  /**
   * Enter admin client view mode.
   * Sets up the context so dashboard pages fetch data for the viewed client.
   *
   * @param {object} clientInfo - { client_id, company_name, plan_tier, closers }
   */
  const viewAsClient = useCallback((clientInfo) => {
    setAuth((prev) => ({
      ...prev,
      adminViewClientId: clientInfo.client_id,
      adminViewCompanyName: clientInfo.company_name,
      adminViewTier: clientInfo.plan_tier,
      adminViewClosers: clientInfo.closers || [],
    }));
  }, []);

  /**
   * Exit admin client view mode.
   * Called when navigating back from a client's dashboard to the admin panel.
   */
  const exitClientView = useCallback(() => {
    setAuth((prev) => ({
      ...prev,
      adminViewClientId: null,
      adminViewCompanyName: null,
      adminViewTier: null,
      adminViewClosers: [],
    }));
  }, []);

  /**
   * Log out — clears all auth state.
   */
  const logout = useCallback(() => {
    sessionStorage.removeItem('adminApiKey');
    setAuth({
      mode: null,
      token: null,
      clientId: null,
      companyName: null,
      tier: null,
      closers: [],
      isAuthenticated: false,
      isLoading: false,
      error: null,
      adminViewClientId: null,
      adminViewCompanyName: null,
      adminViewTier: null,
      adminViewClosers: [],
    });
  }, []);

  // Expose "effective" closers — in admin view mode, use the viewed client's closers.
  // This lets CloserFilter work without knowing about admin view mode.
  const effectiveClosers = auth.adminViewClosers && auth.adminViewClosers.length > 0
    ? auth.adminViewClosers
    : auth.closers;

  // When admin is viewing a client, use the client's tier so the admin
  // sees the same locks/gates the client would see.
  const effectiveTier = (auth.mode === 'admin' && auth.adminViewTier)
    ? auth.adminViewTier
    : auth.tier;

  const value = {
    ...auth,
    tier: effectiveTier,
    closers: effectiveClosers,
    validateClientToken,
    loginAsAdmin,
    checkAdminSession,
    viewAsClient,
    exitClientView,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth state and methods.
 * @returns {object} Auth context value
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
