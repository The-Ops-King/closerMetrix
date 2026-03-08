/**
 * CALL SOURCE FILTER -- Multi-Select Dropdown
 *
 * Multi-select dropdown of call sources configured in settings.
 * Options come from AuthContext callSources (settings_json.call_sources).
 * Available to all tiers.
 *
 * Updates FilterContext callSource (string[]) when selection changes.
 * Each source name is matched against the call_source field on call records.
 */

import React from 'react';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';

export default function CallSourceFilter() {
  const { callSources } = useAuth();
  const { callSource, setCallSource } = useFilters();

  // Don't render if no call sources configured in settings
  if (!callSources || callSources.length === 0) {
    return null;
  }

  const hasSelection = callSource.length > 0;

  return (
    <FormControl size="small" sx={{ minWidth: { xs: 160, md: 180 }, maxWidth: 320 }}>
      <Select
        multiple
        value={callSource}
        onChange={(e) => setCallSource(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
        renderValue={(selected) => {
          if (!selected || selected.length === 0) {
            return <em style={{ color: COLORS.text.secondary, fontSize: 'inherit' }}>All Sources</em>;
          }
          return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(107, 207, 127, 0.15)',
                    color: COLORS.neon.green,
                    border: '1px solid rgba(107, 207, 127, 0.3)',
                    '& .MuiChip-deleteIcon': {
                      color: COLORS.neon.green,
                      fontSize: '0.85rem',
                      '&:hover': { color: COLORS.text.primary },
                    },
                  }}
                  onDelete={(e) => {
                    e.stopPropagation();
                    setCallSource(callSource.filter((s) => s !== name));
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
            onClick={(e) => { e.stopPropagation(); setCallSource([]); }}
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
            borderColor: hasSelection ? COLORS.neon.green : COLORS.border.default,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.green : COLORS.border.default,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.green : COLORS.border.default,
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
        {callSources.map((source) => (
          <MenuItem
            key={source.id || source.name}
            value={source.name}
            sx={{
              color: COLORS.text.primary,
              '&.Mui-selected': {
                backgroundColor: 'rgba(107, 207, 127, 0.08)',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'rgba(107, 207, 127, 0.12)',
              },
            }}
          >
            {source.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
