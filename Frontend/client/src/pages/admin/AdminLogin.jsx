/**
 * ADMIN LOGIN PAGE
 *
 * Simple password field where Tyler enters the admin API key.
 * On success, stores in sessionStorage and redirects to /admin.
 * No user accounts, no OAuth — just a shared secret key.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';

export default function AdminLogin() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const { loginAsAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Enter the admin API key');
      return;
    }

    // Validate the key by calling the admin clients endpoint
    try {
      const res = await fetch('/api/admin/clients', {
        headers: { 'X-Admin-Key': apiKey.trim() },
      });
      if (res.ok) {
        loginAsAdmin(apiKey.trim());
        navigate('/admin');
      } else if (res.status === 401 || res.status === 403) {
        setError('Invalid API key');
      } else {
        // Auth passed but server had another error — key is valid, proceed
        loginAsAdmin(apiKey.trim());
        navigate('/admin');
      }
    } catch (err) {
      setError('Server unavailable — is the API running?');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.bg.primary,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: 400,
          p: 4,
          borderRadius: 2,
          border: `1px solid ${COLORS.border.subtle}`,
          backgroundColor: COLORS.bg.secondary,
        }}
      >
        <Typography
          variant="h5"
          sx={{ color: COLORS.neon.cyan, textAlign: 'center', mb: 1 }}
        >
          CloserMetrix
        </Typography>
        <Typography
          variant="body2"
          sx={{ textAlign: 'center', mb: 3, color: COLORS.text.secondary }}
        >
          Admin Access
        </Typography>

        <TextField
          fullWidth
          type="password"
          label="API Key"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setError(''); }}
          error={!!error}
          helperText={error}
          autoFocus
          sx={{ mb: 2 }}
        />

        <Button
          fullWidth
          type="submit"
          variant="contained"
          sx={{ py: 1.5, fontWeight: 600 }}
        >
          Access Dashboard
        </Button>
      </Box>
    </Box>
  );
}
