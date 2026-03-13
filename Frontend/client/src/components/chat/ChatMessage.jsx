import React from 'react';
import { Box, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { COLORS } from '../../theme/constants';

function LoadingDots() {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, py: 0.5 }}>
      {[0, 1, 2].map(i => (
        <Box
          key={i}
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: COLORS.neon.cyan,
            opacity: 0.4,
            animation: 'chatPulse 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
            '@keyframes chatPulse': {
              '0%, 100%': { opacity: 0.4, transform: 'scale(1)' },
              '50%': { opacity: 1, transform: 'scale(1.2)' },
            },
          }}
        />
      ))}
    </Box>
  );
}

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isLoading = message.isLoading;
  const isError = message.isError;

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <Box sx={{
        maxWidth: '85%',
        px: 1.5,
        py: 1,
        borderRadius: 2,
        bgcolor: isUser
          ? COLORS.neon.cyan + '18'
          : isError
            ? COLORS.neon.red + '15'
            : COLORS.bg.elevated,
        border: `1px solid ${
          isUser ? COLORS.neon.cyan + '30'
          : isError ? COLORS.neon.red + '30'
          : COLORS.border.glow + '20'
        }`,
      }}>
        {isLoading ? (
          <LoadingDots />
        ) : (
          <Box
            sx={{
              color: isError ? COLORS.neon.red : COLORS.text.primary,
              fontSize: 13,
              lineHeight: 1.6,
              wordBreak: 'break-word',
              '& p': { m: 0, mb: 0.5, '&:last-child': { mb: 0 } },
              '& strong': { fontWeight: 700, color: COLORS.neon.cyan },
              '& em': { fontStyle: 'italic', color: COLORS.text.secondary },
              '& code': {
                bgcolor: COLORS.bg.primary,
                px: 0.5,
                borderRadius: 0.5,
                fontSize: 12,
                fontFamily: 'monospace',
              },
              '& ul, & ol': { pl: 2, my: 0.5 },
              '& li': { mb: 0.25 },
              '& h2, & h3, & h4': {
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.neon.cyan,
                mt: 1,
                mb: 0.5,
              },
              '& table': {
                width: '100%',
                borderCollapse: 'collapse',
                my: 0.5,
                fontSize: 11,
                display: 'block',
                overflowX: 'auto',
              },
              '& th': {
                textAlign: 'left',
                borderBottom: `1px solid ${COLORS.border.glow}40`,
                py: 0.5,
                px: 0.75,
                fontWeight: 600,
                color: COLORS.neon.cyan,
              },
              '& td': {
                py: 0.5,
                px: 0.75,
                borderBottom: `1px solid ${COLORS.border.glow}15`,
              },
              '& hr': {
                border: 'none',
                borderTop: `1px solid ${COLORS.border.glow}30`,
                my: 1,
              },
            }}
          >
            {isUser ? (
              <Typography sx={{ fontSize: 13, lineHeight: 1.6 }}>{message.content}</Typography>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            )}
          </Box>
        )}
        {message.toolsUsed?.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {message.toolsUsed.map((tool, i) => (
              <Box
                key={i}
                sx={{
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: COLORS.neon.purple + '20',
                  border: `1px solid ${COLORS.neon.purple}30`,
                  fontSize: 10,
                  color: COLORS.neon.purple,
                }}
              >
                {tool.replace(/_/g, ' ')}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
