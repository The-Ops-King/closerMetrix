import React, { useRef, useEffect } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { COLORS } from '../../theme/constants';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import useChatbot from '../../hooks/useChatbot';

const SUGGESTED_QUESTIONS = [
  'What was my close rate this month?',
  'Show my top performing closer',
  'How many calls did we have this week?',
  'What are the most common objections?',
];

export default function ChatPanel({ onClose, visible }) {
  const { messages, isLoading, error, sendMessage, startNewConversation } = useChatbot();
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 100,
      right: 28,
      width: 400,
      height: 600,
      zIndex: 9998,
      display: visible ? 'flex' : 'none',
      flexDirection: 'column',
      bgcolor: COLORS.bg.secondary,
      border: `1px solid ${COLORS.border.glow}`,
      borderRadius: 3,
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${COLORS.border.glow}40`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.5,
        borderBottom: `1px solid ${COLORS.border.glow}30`,
        bgcolor: COLORS.bg.primary,
      }}>
        <Typography sx={{ color: COLORS.text.primary, fontWeight: 600, fontSize: 14 }}>
          CloserMetrix AI
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {/* New conversation button */}
          <IconButton
            onClick={startNewConversation}
            size="small"
            title="New conversation"
            sx={{ color: COLORS.text.muted, '&:hover': { color: COLORS.neon.cyan } }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </IconButton>
          {/* Close button */}
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ color: COLORS.text.muted, '&:hover': { color: COLORS.neon.red } }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </IconButton>
        </Box>
      </Box>

      {/* Messages area */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        px: 2,
        py: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border.glow + '40', borderRadius: 3 },
      }}>
        {messages.length === 0 ? (
          /* Empty state with suggested questions */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 4, gap: 2 }}>
            <Typography sx={{ color: COLORS.text.muted, fontSize: 13, textAlign: 'center', mb: 1 }}>
              Ask me anything about your sales data
            </Typography>
            {SUGGESTED_QUESTIONS.map((q) => (
              <Box
                key={q}
                onClick={() => sendMessage(q)}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  border: `1px solid ${COLORS.border.glow}30`,
                  bgcolor: COLORS.bg.elevated,
                  color: COLORS.text.secondary,
                  fontSize: 12,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: COLORS.neon.cyan,
                    color: COLORS.neon.cyan,
                    bgcolor: COLORS.bg.tertiary,
                  },
                }}
              >
                {q}
              </Box>
            ))}
          </Box>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))
        )}
        {isLoading && (
          <ChatMessage message={{ role: 'assistant', content: '', isLoading: true }} />
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input area */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </Box>
  );
}
