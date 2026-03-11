/**
 * CLOSER FILTER -- Insight+ Only (Multi-Select)
 *
 * Multi-select dropdown of closers for this client with chip rendering.
 * Options are derived from raw call data filtered by the current date range —
 * only closers who have calls in the selected period appear as options.
 * Hidden for Basic tier clients (controlled by parent).
 *
 * Updates FilterContext closerIds (string[]) when selection changes.
 */

import React, { useMemo } from 'react';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { COLORS } from '../../theme/constants';
import { useData } from '../../context/DataContext';
import { useFilters } from '../../context/FilterContext';

export default function CloserFilter({ disabled = false }) {
  const { rawData } = useData();
  const { closerIds, setCloserIds, dateRange } = useFilters();

  // Derive closer options from ALL calls (not date-filtered) so the filter
  // never disappears when the date range has no data
  const closerOptions = useMemo(() => {
    if (!rawData?.calls) return [];

    const map = new Map(); // closerId -> closerName
    for (const call of rawData.calls) {
      if (!call.closerId || !call.closerName) continue;
      if (!map.has(call.closerId)) {
        map.set(call.closerId, call.closerName);
      }
    }

    // Sort alphabetically by name
    return Array.from(map.entries())
      .map(([id, name]) => ({ closer_id: id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawData?.calls]);

  // Build lookup map for rendering chips
  const closerMap = useMemo(() => {
    const m = {};
    closerOptions.forEach((c) => { m[c.closer_id] = c.name; });
    return m;
  }, [closerOptions]);

  // When disabled (Basic tier), render a locked placeholder shell
  if (disabled) {
    return (
      <FormControl size="small" sx={{ minWidth: 180 }} disabled>
        <Select
          value={[]}
          multiple
          displayEmpty
          IconComponent={() => (
            <LockOutlinedIcon sx={{ color: COLORS.text.muted, fontSize: '1rem', mr: 1 }} />
          )}
          renderValue={() => (
            <em style={{ color: COLORS.text.muted }}>All Closers</em>
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

  // Still render the filter when no closers found — shows "All Closers" placeholder
  // (rawData may still be loading, or the client has no closer data yet)

  // Clear any selected closerIds that are no longer in the options
  const validIds = closerIds.filter((id) => closerMap[id]);
  if (validIds.length !== closerIds.length) {
    // Defer to avoid render-during-render
    setTimeout(() => setCloserIds(validIds), 0);
  }

  const hasSelection = closerIds.length > 0;

  return (
    <FormControl size="small" sx={{ minWidth: { xs: 160, md: 180 }, maxWidth: 320 }}>
      <Select
        multiple
        value={validIds}
        onChange={(e) => setCloserIds(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
        renderValue={(selected) => {
          if (!selected || selected.length === 0) {
            return <em style={{ color: COLORS.text.secondary, fontSize: 'inherit' }}>All Closers</em>;
          }
          return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((id) => (
                <Chip
                  key={id}
                  label={closerMap[id] || id}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(77, 212, 232, 0.15)',
                    color: COLORS.neon.cyan,
                    border: '1px solid rgba(77, 212, 232, 0.3)',
                    '& .MuiChip-deleteIcon': {
                      color: COLORS.neon.cyan,
                      fontSize: '0.85rem',
                      '&:hover': { color: COLORS.text.primary },
                    },
                  }}
                  onDelete={(e) => {
                    e.stopPropagation();
                    setCloserIds(closerIds.filter((cid) => cid !== id));
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ))}
            </Box>
          );
        }}
        displayEmpty
        endAdornment={hasSelection ? (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setCloserIds([]); }}
            onMouseDown={(e) => e.stopPropagation()}
            sx={{ mr: 1.5, p: 0.3, color: COLORS.text.muted, '&:hover': { color: COLORS.text.primary } }}
          >
            <CloseIcon sx={{ fontSize: '0.9rem' }} />
          </IconButton>
        ) : null}
        sx={{
          color: COLORS.text.primary,
          backgroundColor: COLORS.bg.secondary,
          fontSize: { xs: '0.9rem', md: '0.8125rem' },
          minHeight: { xs: 38, md: 'auto' },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.cyan : COLORS.border.default,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.cyan : COLORS.border.default,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.cyan : COLORS.border.default,
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
              maxHeight: 300,
            },
          },
        }}
      >
        {closerOptions.map((closer) => (
          <MenuItem
            key={closer.closer_id}
            value={closer.closer_id}
            sx={{
              color: COLORS.text.primary,
              '&.Mui-selected': {
                backgroundColor: 'rgba(77, 212, 232, 0.08)',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'rgba(77, 212, 232, 0.12)',
              },
            }}
          >
            {closer.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
