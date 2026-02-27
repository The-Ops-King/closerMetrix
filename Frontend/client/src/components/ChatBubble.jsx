import React from 'react';
import { COLORS } from '../theme/constants';

/**
 * Floating chat bubble button — fixed to bottom-right corner.
 * Will eventually open a chatbot panel. For now, it's a visual placeholder.
 */
export default function ChatBubble() {
  return (
    <button
      onClick={() => {/* TODO: open chatbot panel */}}
      aria-label="Open chat assistant"
      style={{
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
        background: COLORS.neon.red,
        boxShadow: `0 4px 20px rgba(255, 77, 109, 0.45), 0 0 40px rgba(255, 77, 109, 0.2)`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 4px 28px rgba(255, 77, 109, 0.6), 0 0 50px rgba(255, 77, 109, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 77, 109, 0.45), 0 0 40px rgba(255, 77, 109, 0.2)';
      }}
    >
      {/* Chat bubble icon (SVG) */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
          fill="white"
        />
        <circle cx="8" cy="10" r="1.2" fill={COLORS.neon.red} />
        <circle cx="12" cy="10" r="1.2" fill={COLORS.neon.red} />
        <circle cx="16" cy="10" r="1.2" fill={COLORS.neon.red} />
      </svg>
    </button>
  );
}
