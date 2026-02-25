/**
 * RISK REVIEW TABLE — The Executive Tier Money Feature
 *
 * Detailed table showing SEC/FTC risk flags with exact phrases, timestamps,
 * closer names, risk categories, and links to recordings/transcripts.
 * This is the single most valuable component in the Executive tier —
 * it shows clients EXACTLY what their closers said that could get them in trouble.
 *
 * Includes an inline filter bar with 3 filters linked to global FilterContext
 * (riskCategory, closerIds, dateRange) and client-side filtering of the rows array.
 * Same pattern as ObjectionDetailTable.
 *
 * Props:
 *   rows: Array<{
 *     date: string,            — ISO date or formatted date string
 *     closer: string,          — closer name
 *     closerId: string,        — closer ID for filtering
 *     callType: string,        — "First Call" or "Follow-Up"
 *     riskCategory: string,    — "Claims" | "Guarantees" | "Earnings" | "Pressure"
 *     timestamp: string,       — minute:second in the call, e.g. "12:34"
 *     exactPhrase: string,     — the actual words flagged (the key column)
 *     whyFlagged: string,      — plain English explanation of why this is a risk
 *     recordingUrl: string,    — link to call recording (opens at timestamp)
 *     transcriptUrl: string,   — link to full transcript
 *   }>
 */

import React, { useMemo, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { useFilters } from '../../context/FilterContext';
import SectionHeader from '../SectionHeader';
import DateRangeFilter from '../filters/DateRangeFilter';
import { RISK_CATEGORIES, RISK_CATEGORY_COLORS as RISK_COLOR_NAMES } from '../../../../shared/categoryValues.js';
import { COLOR_MAP } from '../../utils/colors';

/** Resolve color name strings to hex values for direct use in styles */
const RISK_CATEGORY_COLORS = Object.fromEntries(
  Object.entries(RISK_COLOR_NAMES).map(([k, colorName]) => [k, COLOR_MAP[colorName] || COLORS.neon.red])
);

/**
 * Returns the accent color for a given risk category.
 * Falls back to red if the category is unrecognized.
 * @param {string} category — risk category name
 * @returns {string} — hex color
 */
function getCategoryColor(category) {
  return RISK_CATEGORY_COLORS[category] || COLORS.neon.red;
}

/**
 * Format a date string into a short readable format.
 * If the date is already formatted, pass it through.
 * @param {string} dateStr — ISO date or pre-formatted string
 * @returns {string} — formatted date like "Jan 15, 2026" or the original string
 */
function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    // Guard against invalid dates — return original string if parsing fails
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Shared sx for filter selects — matches TopBar filter sizing.
 * Border stays accent-colored when items are selected so you can see active filters at a glance.
 */
const filterSelectSx = (accentHex, hasSelection) => ({
  color: COLORS.text.primary,
  backgroundColor: COLORS.bg.secondary,
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: hasSelection ? accentHex : COLORS.border.default,
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: hasSelection ? accentHex : COLORS.border.default,
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: hasSelection ? accentHex : COLORS.border.default,
  },
  '& .MuiSvgIcon-root': { color: COLORS.text.secondary },
});

/** Clear-all X button shown as endAdornment when a filter has selections */
function ClearButton({ onClick }) {
  return (
    <IconButton
      size="small"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{ mr: 1.5, p: 0.3, color: COLORS.text.muted, '&:hover': { color: COLORS.text.primary } }}
    >
      <CloseIcon sx={{ fontSize: '0.9rem' }} />
    </IconButton>
  );
}

export default function RiskReviewTable({ rows }) {
  const { riskCategory, setRiskCategory, closerIds, setCloserIds, dateRange } = useFilters();

  // Normalize riskCategory from context
  const selectedCategories = riskCategory || [];

  // Build closer ID→name lookup and sorted options from row data
  const { closerIdToName, closerOptions } = useMemo(() => {
    const map = {};
    (rows || []).forEach((r) => { if (r.closerId && r.closer) map[r.closerId] = r.closer; });
    const opts = Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    return { closerIdToName: map, closerOptions: opts };
  }, [rows]);

  /* ─── Client-side filtering ─────────────────────────────────────────── */
  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    return rows.filter((row) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(row.riskCategory)) return false;
      if (closerIds.length > 0 && !closerIds.includes(row.closerId)) return false;
      if (dateRange?.start && row.date < dateRange.start) return false;
      if (dateRange?.end && row.date > dateRange.end) return false;
      return true;
    });
  }, [rows, selectedCategories, closerIds, dateRange]);

  /* ─── Pagination ────────────────────────────────────────────────────── */
  const ROWS_PER_PAGE = 10;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const pagedRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedCategories.length, closerIds.length, dateRange]);

  const accentColor = COLORS.neon.red;

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderTop: `2px solid ${hexToRgba(accentColor, 0.3)}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        padding: 3,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        '&:hover': {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderTopColor: hexToRgba(accentColor, 0.3),
          boxShadow: '0 0 25px rgba(0, 0, 0, 0.4)',
        },
      }}
    >
      {/* Section title */}
      <Box sx={{ mb: 2 }}>
        <SectionHeader title="Risk Review — Flagged Phrases" color={accentColor} size="sm" />
      </Box>

      {/* ─── Inline Filter Bar ─────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          mb: 2,
          pb: 2,
          borderBottom: `1px solid ${COLORS.border.subtle}`,
        }}
      >
        {/* Risk Category — linked to FilterContext */}
        <FormControl size="small" sx={{ minWidth: 180, maxWidth: 320 }}>
          <Select
            multiple
            value={selectedCategories}
            onChange={(e) => {
              const val = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
              setRiskCategory(val.length > 0 ? val : null);
            }}
            displayEmpty
            renderValue={(sel) => {
              if (!sel || sel.length === 0) return <em style={{ color: COLORS.text.secondary }}>All Categories</em>;
              return (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sel.map((t) => (
                    <Chip key={t} label={t} size="small"
                      sx={{
                        height: 22, fontSize: '0.72rem',
                        backgroundColor: 'rgba(255, 77, 109, 0.15)', color: COLORS.neon.red,
                        border: '1px solid rgba(255, 77, 109, 0.3)',
                        '& .MuiChip-deleteIcon': { color: COLORS.neon.red, fontSize: '0.85rem', '&:hover': { color: COLORS.text.primary } },
                      }}
                      onDelete={(e) => { e.stopPropagation(); const next = selectedCategories.filter((x) => x !== t); setRiskCategory(next.length > 0 ? next : null); }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ))}
                </Box>
              );
            }}
            endAdornment={selectedCategories.length > 0 ? <ClearButton onClick={() => setRiskCategory(null)} /> : null}
            sx={filterSelectSx(COLORS.neon.red, selectedCategories.length > 0)}
            MenuProps={{ PaperProps: { sx: { backgroundColor: COLORS.bg.secondary, border: `1px solid ${COLORS.border.default}`, maxHeight: 300 } } }}
          >
            {RISK_CATEGORIES.map((t) => (
              <MenuItem key={t} value={t} sx={{ color: COLORS.text.primary, '&.Mui-selected': { backgroundColor: 'rgba(255, 77, 109, 0.08)' }, '&.Mui-selected:hover': { backgroundColor: 'rgba(255, 77, 109, 0.12)' } }}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Closer — linked to FilterContext */}
        <FormControl size="small" sx={{ minWidth: 180, maxWidth: 320 }}>
          <Select
            multiple
            value={closerIds}
            onChange={(e) => setCloserIds(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
            displayEmpty
            renderValue={(sel) => {
              if (!sel || sel.length === 0) return <em style={{ color: COLORS.text.secondary }}>All Closers</em>;
              return (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sel.map((id) => (
                    <Chip key={id} label={closerIdToName[id] || id} size="small"
                      sx={{
                        height: 22, fontSize: '0.72rem',
                        backgroundColor: 'rgba(77, 212, 232, 0.15)', color: COLORS.neon.cyan,
                        border: '1px solid rgba(77, 212, 232, 0.3)',
                        '& .MuiChip-deleteIcon': { color: COLORS.neon.cyan, fontSize: '0.85rem', '&:hover': { color: COLORS.text.primary } },
                      }}
                      onDelete={(e) => { e.stopPropagation(); setCloserIds(closerIds.filter((c) => c !== id)); }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ))}
                </Box>
              );
            }}
            endAdornment={closerIds.length > 0 ? <ClearButton onClick={() => setCloserIds([])} /> : null}
            sx={filterSelectSx(COLORS.neon.cyan, closerIds.length > 0)}
            MenuProps={{ PaperProps: { sx: { backgroundColor: COLORS.bg.secondary, border: `1px solid ${COLORS.border.default}`, maxHeight: 300 } } }}
          >
            {closerOptions.map(({ id, name }) => (
              <MenuItem key={id} value={id} sx={{ color: COLORS.text.primary, '&.Mui-selected': { backgroundColor: 'rgba(77, 212, 232, 0.08)' }, '&.Mui-selected:hover': { backgroundColor: 'rgba(77, 212, 232, 0.12)' } }}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Date Range — linked to FilterContext */}
        <DateRangeFilter />

        {/* Row count */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
            Showing {filteredRows.length} of {(rows || []).length} flags
          </Typography>
        </Box>
      </Box>

      {/* ─── Data Table ────────────────────────────────────────────────── */}
      {filteredRows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography sx={{ color: COLORS.text.muted }}>
            No risk flags match the current filters
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              width: '100%',
              overflowX: 'auto',
              borderRadius: 1,
              border: `1px solid ${COLORS.border.subtle}`,
            }}
          >
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                /* --- Header cells --- */
                '& th': {
                  padding: '10px 12px',
                  textAlign: 'left',
                  borderBottom: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.secondary,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  backgroundColor: COLORS.bg.tertiary,
                  whiteSpace: 'nowrap',
                },
                /* --- Body cells --- */
                '& td': {
                  padding: '10px 12px',
                  textAlign: 'left',
                  borderBottom: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.primary,
                  fontSize: '0.8rem',
                  verticalAlign: 'top',
                },
                /* Remove bottom border on last row */
                '& tr:last-child td': {
                  borderBottom: 'none',
                },
                /* Row hover — red tint for violations theme */
                '& tbody tr:hover td': {
                  backgroundColor: 'rgba(255, 51, 102, 0.03)',
                },
              }}
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Closer</th>
                  <th>Call Type</th>
                  <th>Risk Category</th>
                  <th>Timestamp</th>
                  <th style={{ minWidth: 200 }}>Exact Phrase</th>
                  <th>Why Flagged</th>
                  <th>Recording</th>
                  <th>Transcript</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, idx) => {
                  const categoryColor = getCategoryColor(row.riskCategory);

                  return (
                    <tr key={idx}>
                      {/* Date — muted, left-aligned */}
                      <td style={{ color: COLORS.text.muted, whiteSpace: 'nowrap' }}>
                        {formatDate(row.date)}
                      </td>

                      {/* Closer — bold name */}
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {row.closer || '\u2014'}
                      </td>

                      {/* Call Type — subtle pill/badge */}
                      <td>
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            letterSpacing: '0.03em',
                            backgroundColor: 'rgba(148, 163, 184, 0.1)',
                            color: COLORS.text.secondary,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.callType || '\u2014'}
                        </Box>
                      </td>

                      {/* Risk Category — color-coded pill */}
                      <td>
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                            backgroundColor: `${categoryColor}26`,
                            color: categoryColor,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.riskCategory || '\u2014'}
                        </Box>
                      </td>

                      {/* Timestamp — monospace, small, muted */}
                      <td
                        style={{
                          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                          fontSize: '0.75rem',
                          color: COLORS.text.muted,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.timestamp || '\u2014'}
                      </td>

                      {/* Exact Phrase — the key column, italic, quoted */}
                      <td
                        style={{
                          minWidth: 200,
                          maxWidth: 360,
                          fontStyle: 'italic',
                          color: COLORS.text.primary,
                          lineHeight: 1.5,
                        }}
                      >
                        {row.exactPhrase ? `\u201C${row.exactPhrase}\u201D` : '\u2014'}
                      </td>

                      {/* Why Flagged — secondary text, smaller font */}
                      <td
                        style={{
                          color: COLORS.text.secondary,
                          fontSize: '0.75rem',
                          maxWidth: 280,
                          lineHeight: 1.5,
                        }}
                      >
                        {row.whyFlagged || '\u2014'}
                      </td>

                      {/* Recording — cyan "Play" link */}
                      <td>
                        {row.recordingUrl ? (
                          <Box
                            component="a"
                            href={row.recordingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              color: COLORS.neon.cyan,
                              textDecoration: 'none',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              letterSpacing: '0.03em',
                              cursor: 'pointer',
                              transition: 'opacity 0.15s ease',
                              '&:hover': {
                                opacity: 0.8,
                                textDecoration: 'underline',
                              },
                            }}
                          >
                            Play
                          </Box>
                        ) : (
                          <span style={{ color: COLORS.text.muted }}>{'\u2014'}</span>
                        )}
                      </td>

                      {/* Transcript — purple "View" link */}
                      <td>
                        {row.transcriptUrl ? (
                          <Box
                            component="a"
                            href={row.transcriptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              color: COLORS.neon.purple,
                              textDecoration: 'none',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              letterSpacing: '0.03em',
                              cursor: 'pointer',
                              transition: 'opacity 0.15s ease',
                              '&:hover': {
                                opacity: 0.8,
                                textDecoration: 'underline',
                              },
                            }}
                          >
                            View
                          </Box>
                        ) : (
                          <span style={{ color: COLORS.text.muted }}>{'\u2014'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Box>
          </Box>

          {/* ─── Pagination ──────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pt: 2,
              }}
            >
              <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
                Showing {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, filteredRows.length)} of {filteredRows.length}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  component="button"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  sx={{
                    background: 'none', border: `1px solid ${COLORS.border.default}`, borderRadius: 1,
                    px: 1.5, py: 0.5, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                    color: page === 0 ? COLORS.text.muted : COLORS.neon.cyan,
                    '&:hover:not(:disabled)': { borderColor: COLORS.neon.cyan, backgroundColor: 'rgba(77, 212, 232, 0.08)' },
                    '&:disabled': { cursor: 'default', opacity: 0.5 },
                  }}
                >
                  Previous
                </Box>
                <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', px: 1 }}>
                  {page + 1} / {totalPages}
                </Typography>
                <Box
                  component="button"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages - 1}
                  sx={{
                    background: 'none', border: `1px solid ${COLORS.border.default}`, borderRadius: 1,
                    px: 1.5, py: 0.5, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                    color: page >= totalPages - 1 ? COLORS.text.muted : COLORS.neon.cyan,
                    '&:hover:not(:disabled)': { borderColor: COLORS.neon.cyan, backgroundColor: 'rgba(77, 212, 232, 0.08)' },
                    '&:disabled': { cursor: 'default', opacity: 0.5 },
                  }}
                >
                  Next
                </Box>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
