/**
 * REACT ENTRY POINT
 * Sets up MUI ThemeProvider, React Query, and renders the App router.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tronTheme } from './theme/tronTheme';
import App from './App';

// TanStack Query client — caches dashboard data, refetches on filter change
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // Data stays fresh for 5 minutes
      refetchOnWindowFocus: false,    // Don't refetch when tab regains focus
      retry: 1,                       // Retry failed requests once
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={tronTheme}>
        {/* CssBaseline resets browser defaults and applies dark background */}
        <CssBaseline />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
