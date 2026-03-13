import React, { useState, useRef } from 'react';
import { Box, IconButton } from '@mui/material';
import { COLORS } from '../../theme/constants';

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
    // Re-focus input after sending
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: 1,
      px: 2,
      py: 1.5,
      borderTop: `1px solid ${COLORS.border.glow}30`,
      bgcolor: COLORS.bg.primary,
    }}>
      <Box
        component="textarea"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 2000))}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your sales data..."
        disabled={disabled}
        rows={1}
        sx={{
          flex: 1,
          resize: 'none',
          border: `1px solid ${COLORS.border.glow}30`,
          borderRadius: 2,
          bgcolor: COLORS.bg.secondary,
          color: COLORS.text.primary,
          px: 1.5,
          py: 1,
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          maxHeight: 80,
          overflowY: 'auto',
          '&:focus': {
            borderColor: COLORS.neon.cyan,
          },
          '&::placeholder': {
            color: COLORS.text.muted,
          },
          '&:disabled': {
            opacity: 0.5,
          },
        }}
      />
      <IconButton
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        sx={{
          color: value.trim() ? COLORS.neon.cyan : COLORS.text.muted,
          '&:hover': { color: COLORS.neon.cyan, bgcolor: COLORS.neon.cyan + '15' },
          '&:disabled': { color: COLORS.text.muted, opacity: 0.4 },
          mb: 0.25,
        }}
      >
        {/* Send arrow icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </IconButton>
    </Box>
  );
}
