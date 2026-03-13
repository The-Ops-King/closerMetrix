import React, { useState } from 'react';
import { Box } from '@mui/material';
import { COLORS } from '../theme/constants';
import { useAuth } from '../context/AuthContext';
import ChatPanel from './chat/ChatPanel';

/**
 * Floating chat bubble button — fixed to bottom-right corner.
 * Opens the AI chatbot panel. Only visible for insight+ tiers.
 */
export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const auth = useAuth();

  // Only show for insight+ tiers
  const tier = auth?.tier;
  if (!tier || tier === 'basic') return null;

  return (
    <>
      <ChatPanel onClose={() => setOpen(false)} visible={open} />
      <Box
        component="button"
        onClick={() => setOpen(prev => !prev)}
        aria-label={open ? 'Close chat assistant' : 'Open chat assistant'}
        sx={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 9999,
          width: 60,
          height: 60,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: COLORS.neon.red,
          boxShadow: `0 4px 20px rgba(255, 77, 109, 0.45), 0 0 40px rgba(255, 77, 109, 0.2)`,
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'scale(1.1)',
            boxShadow: '0 4px 28px rgba(255, 77, 109, 0.6), 0 0 50px rgba(255, 77, 109, 0.3)',
          },
        }}
      >
        {open ? (
          /* X close icon */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          /* Chat bubble icon */
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white" />
            <circle cx="8" cy="10" r="1.2" fill={COLORS.neon.red} />
            <circle cx="12" cy="10" r="1.2" fill={COLORS.neon.red} />
            <circle cx="16" cy="10" r="1.2" fill={COLORS.neon.red} />
          </svg>
        )}
      </Box>
    </>
  );
}
