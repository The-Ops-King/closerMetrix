/**
 * CLOSER FILTER -- Insight+ Only
 *
 * Multi-select dropdown of closers for this client.
 * Populated from AuthContext closers list.
 * Hidden for Basic tier clients (controlled by parent -- this component
 * doesn't check tier itself; the page/layout decides whether to render it).
 *
 * Updates FilterContext closerId when selection changes.
 */

import React from 'react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';

export default function CloserFilter({ disabled = false }) {
  const { closers } = useAuth();
  const { closerId, setCloserId } = useFilters();

  // When disabled (Basic tier), render a locked placeholder shell
  if (disabled) {
    return (
      <FormControl size="small" sx={{ minWidth: 180 }} disabled>
        <InputLabel
          shrink
          sx={{
            color: COLORS.text.muted,
          }}
        >
          Closer
        </InputLabel>
        <Select
          value=""
          label="Closer"
          displayEmpty
          IconComponent={() => (
            <LockOutlinedIcon sx={{ color: COLORS.text.muted, fontSize: '1rem', mr: 1 }} />
          )}
          sx={{
            color: COLORS.text.muted,
            backgroundColor: COLORS.bg.secondary,
            opacity: 0.6,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: COLORS.border.subtle,
            },
          }}
        >
          <MenuItem value="">
            <em style={{ color: COLORS.text.muted }}>All Closers</em>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }

  // Don't render if no closers available (and not disabled)
  if (!closers || closers.length === 0) {
    return null;
  }

  return (
    <FormControl size="small" sx={{ minWidth: 180 }}>
      <InputLabel
        sx={{
          color: COLORS.text.secondary,
          '&.Mui-focused': { color: COLORS.neon.cyan },
        }}
      >
        Closer
      </InputLabel>
      <Select
        value={closerId || ''}
        label="Closer"
        onChange={(e) => setCloserId(e.target.value || null)}
        sx={{
          color: COLORS.text.primary,
          backgroundColor: COLORS.bg.secondary,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: COLORS.border.default,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: COLORS.neon.cyan,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: COLORS.neon.cyan,
          },
          '& .MuiSvgIcon-root': {
            color: COLORS.text.secondary,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              backgroundColor: COLORS.bg.secondary,
              border: `1px solid ${COLORS.border.default}`,
            },
          },
        }}
      >
        <MenuItem value="">
          <em style={{ color: COLORS.text.secondary }}>All Closers</em>
        </MenuItem>
        {closers.map((closer) => (
          <MenuItem
            key={closer.closer_id}
            value={closer.closer_id}
            sx={{ color: COLORS.text.primary }}
          >
            {closer.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
