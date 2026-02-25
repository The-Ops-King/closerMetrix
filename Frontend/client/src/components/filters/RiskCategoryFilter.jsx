/**
 * RISK CATEGORY FILTER — Multi-select dropdown for risk categories.
 *
 * Reads/writes FilterContext.riskCategory (string[] | null).
 * Options: Claims, Guarantees, Earnings, Pressure.
 * Red accent color to match Violations page theme.
 *
 * When empty selection → shows "All Risk Categories" placeholder.
 * Same pattern as ObjectionTypeFilter.
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
import { useFilters } from '../../context/FilterContext';
import { RISK_CATEGORIES } from '../../../../shared/categoryValues.js';

export default function RiskCategoryFilter() {
  const { riskCategory, setRiskCategory } = useFilters();

  // Normalize: null → []
  const selected = riskCategory || [];

  const handleChange = (e) => {
    const val = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
    setRiskCategory(val.length > 0 ? val : null);
  };

  const hasSelection = selected.length > 0;

  return (
    <FormControl size="small" sx={{ minWidth: 180, maxWidth: 320 }}>
      <Select
        multiple
        value={selected}
        onChange={handleChange}
        displayEmpty
        renderValue={(sel) => {
          if (!sel || sel.length === 0) {
            return <em style={{ color: COLORS.text.secondary }}>All Risk Categories</em>;
          }
          return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {sel.map((type) => (
                <Chip
                  key={type}
                  label={type}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(255, 77, 109, 0.15)',
                    color: COLORS.neon.red,
                    border: '1px solid rgba(255, 77, 109, 0.3)',
                    '& .MuiChip-deleteIcon': {
                      color: COLORS.neon.red,
                      fontSize: '0.85rem',
                      '&:hover': { color: COLORS.text.primary },
                    },
                  }}
                  onDelete={(e) => {
                    e.stopPropagation();
                    const next = selected.filter((t) => t !== type);
                    setRiskCategory(next.length > 0 ? next : null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ))}
            </Box>
          );
        }}
        endAdornment={hasSelection ? (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setRiskCategory(null); }}
            onMouseDown={(e) => e.stopPropagation()}
            sx={{ mr: 1.5, p: 0.3, color: COLORS.text.muted, '&:hover': { color: COLORS.text.primary } }}
          >
            <CloseIcon sx={{ fontSize: '0.9rem' }} />
          </IconButton>
        ) : null}
        sx={{
          color: COLORS.text.primary,
          backgroundColor: COLORS.bg.secondary,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.red : COLORS.border.default,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.red : COLORS.border.default,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: hasSelection ? COLORS.neon.red : COLORS.border.default,
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
        {RISK_CATEGORIES.map((type) => (
          <MenuItem
            key={type}
            value={type}
            sx={{
              color: COLORS.text.primary,
              '&.Mui-selected': {
                backgroundColor: 'rgba(255, 77, 109, 0.08)',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'rgba(255, 77, 109, 0.12)',
              },
            }}
          >
            {type}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
