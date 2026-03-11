/**
 * OBJECTION DETAIL TABLE — Drill-down table showing individual objection records.
 *
 * Includes an inline filter bar with 5 filters (3 linked to global FilterContext,
 * 2 local to the ObjectionsPage). Client-side filtering of the rows array.
 *
 * Props:
 *   rows: Array — detail row array from tables.detail.rows
 *   accentColor: string — defaults to cyan
 *   resolvedFilter: null | true | false — local resolved toggle (null=all)
 *   setResolvedFilter: function
 *   outcomeFilter: string[] — local call outcome multi-select ([] = all)
 *   setOutcomeFilter: function
 */

import React, { useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import dayjs from 'dayjs';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { useFilters } from '../../context/FilterContext';
import SectionHeader from '../SectionHeader';
import DateRangeFilter from '../filters/DateRangeFilter';
import { OBJECTION_TYPES_ALL, OUTCOME_COLORS as OUTCOME_COLOR_NAMES } from '../../../../shared/categoryValues.js';
import { ALL_CALL_OUTCOMES } from '../../../../shared/callValues.js';
import { COLOR_MAP } from '../../utils/colors';

const OBJECTION_TYPES = OBJECTION_TYPES_ALL;
const CALL_OUTCOMES = ALL_CALL_OUTCOMES;

/** Color mapping for call outcomes — resolve color names to hex via COLOR_MAP */
const OUTCOME_COLORS = Object.fromEntries(
  Object.entries(OUTCOME_COLOR_NAMES).map(([k, colorName]) => [k, COLOR_MAP[colorName] || COLORS.text.muted])
);

/** Format an ISO date to "Feb 15, 2026" */
function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  return dayjs(dateStr).format('MMM D, YYYY');
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

export default function ObjectionDetailTable({
  rows = [],
  accentColor = COLORS.neon.cyan,
  resolvedFilter,
  setResolvedFilter,
  outcomeFilter = [],
  setOutcomeFilter,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { objectionType, setObjectionType, closerIds, setCloserIds, dateRange } = useFilters();

  // Normalize objectionType from context
  const selectedTypes = objectionType || [];
  const hasActiveFilters = selectedTypes.length > 0 || resolvedFilter !== null || closerIds.length > 0 || outcomeFilter.length > 0;

  // Build closer ID→name lookup and sorted options from row data
  const { closerIdToName, closerOptions } = useMemo(() => {
    const map = {};
    rows.forEach((r) => { if (r.closerId && r.closer) map[r.closerId] = r.closer; });
    const opts = Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    return { closerIdToName: map, closerOptions: opts };
  }, [rows]);

  const ROWS_PER_PAGE = 10;

  /* ─── Client-side filtering ─────────────────────────────────────────── */
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(row.objectionType)) return false;
      if (resolvedFilter !== null && resolvedFilter !== undefined && row.resolved !== resolvedFilter) return false;
      if (closerIds.length > 0 && !closerIds.includes(row.closerId)) return false;
      if (outcomeFilter.length > 0 && !outcomeFilter.includes(row.callOutcome)) return false;
      if (dateRange?.start && row.appointmentDate < dateRange.start) return false;
      if (dateRange?.end && row.appointmentDate > dateRange.end) return false;
      return true;
    });
  }, [rows, selectedTypes, resolvedFilter, closerIds, outcomeFilter, dateRange]);

  /* ─── Pagination ────────────────────────────────────────────────────── */
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const pagedRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedTypes.length, resolvedFilter, closerIds.length, outcomeFilter.length, dateRange]);

  /* ─── Height easing + scroll preservation ─────────────────────────── */
  const tableAreaRef = useRef(null);
  const prevHeightRef = useRef(null);
  const isFirstRender = useRef(true);
  const animFrameRef = useRef(null);

  useLayoutEffect(() => {
    const el = tableAreaRef.current;
    if (!el) return;

    // Cancel any in-progress animation
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    // Reset to auto so we can measure natural height of new content
    el.style.transition = 'none';
    el.style.height = 'auto';
    el.style.overflow = '';
    const newHeight = el.offsetHeight;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevHeightRef.current = newHeight;
      return;
    }

    const oldHeight = prevHeightRef.current ?? newHeight;
    prevHeightRef.current = newHeight;
    const heightDelta = newHeight - oldHeight;

    if (Math.abs(heightDelta) < 2) return;

    // How far user is from page bottom before any visual change
    const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    const nearBottom = distFromBottom < 300;

    // Pin to old height (no visual jump)
    el.style.height = `${oldHeight}px`;
    el.style.overflow = 'hidden';
    void el.offsetHeight; // force reflow

    // Animate height + scroll together over 300ms
    const duration = 300;
    const startTime = performance.now();
    const startScroll = window.scrollY;

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // CSS "ease" approximation: cubic-bezier(0.25, 0.1, 0.25, 1.0)
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const currentHeight = oldHeight + heightDelta * eased;
      el.style.height = `${currentHeight}px`;

      // Keep user's distance from bottom consistent
      if (nearBottom) {
        window.scrollTo(0, startScroll + heightDelta * eased);
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Done — release to auto
        el.style.height = 'auto';
        el.style.overflow = '';
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [filteredRows.length, page]);

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderTop: `2px solid ${hexToRgba(accentColor, 0.3)}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        padding: { xs: 1.5, md: 3 },
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        '&:hover': {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderTopColor: hexToRgba(accentColor, 0.3),
          boxShadow: '0 0 25px rgba(0, 0, 0, 0.4)',
        },
      }}
    >
      {/* Section title + mobile filter toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <SectionHeader title="Objection Detail" color={accentColor} size="sm" />
        {isMobile && (
          <Button
            onClick={() => setFiltersOpen(prev => !prev)}
            size="small"
            startIcon={<TuneIcon sx={{ fontSize: 16 }} />}
            sx={{
              backgroundColor: filtersOpen ? 'rgba(77, 212, 232, 0.10)' : COLORS.bg.tertiary,
              border: `1px solid ${filtersOpen ? COLORS.neon.cyan : COLORS.border.subtle}`,
              borderRadius: '8px',
              color: filtersOpen ? COLORS.neon.cyan : COLORS.text.secondary,
              fontSize: '0.8rem', fontWeight: 500, textTransform: 'none',
              px: 1.5, py: 0.5, minHeight: 34,
              '&:hover': { backgroundColor: COLORS.bg.elevated, borderColor: COLORS.neon.cyan, color: COLORS.neon.cyan },
            }}
          >
            Filters{hasActiveFilters ? ` (${selectedTypes.length + (resolvedFilter !== null ? 1 : 0) + closerIds.length + outcomeFilter.length})` : ''}
          </Button>
        )}
      </Box>

      {/* ─── Inline Filter Bar ─────────────────────────────────────────── */}
      <Collapse in={!isMobile || filtersOpen} timeout={isMobile ? 250 : 0}>
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
        {/* Objection Type — linked to FilterContext */}
        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 180 }, maxWidth: { xs: '100%', md: 320 } }}>
          <Select
            multiple
            value={selectedTypes}
            onChange={(e) => {
              const val = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
              setObjectionType(val.length > 0 ? val : null);
            }}
            displayEmpty
            renderValue={(sel) => {
              if (!sel || sel.length === 0) return <em style={{ color: COLORS.text.secondary }}>All Types</em>;
              return (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sel.map((t) => (
                    <Chip key={t} label={t} size="small"
                      sx={{
                        height: 22, fontSize: '0.72rem',
                        backgroundColor: 'rgba(255, 217, 61, 0.15)', color: COLORS.neon.amber,
                        border: '1px solid rgba(255, 217, 61, 0.3)',
                        '& .MuiChip-deleteIcon': { color: COLORS.neon.amber, fontSize: '0.85rem', '&:hover': { color: COLORS.text.primary } },
                      }}
                      onDelete={(e) => { e.stopPropagation(); const next = selectedTypes.filter((x) => x !== t); setObjectionType(next.length > 0 ? next : null); }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ))}
                </Box>
              );
            }}
            endAdornment={selectedTypes.length > 0 ? <ClearButton onClick={() => setObjectionType(null)} /> : null}
            sx={filterSelectSx(COLORS.neon.amber, selectedTypes.length > 0)}
            MenuProps={{ PaperProps: { sx: { backgroundColor: COLORS.bg.secondary, border: `1px solid ${COLORS.border.default}`, maxHeight: 300 } } }}
          >
            {OBJECTION_TYPES.map((t) => (
              <MenuItem key={t} value={t} sx={{ color: COLORS.text.primary, '&.Mui-selected': { backgroundColor: 'rgba(255, 217, 61, 0.08)' }, '&.Mui-selected:hover': { backgroundColor: 'rgba(255, 217, 61, 0.12)' } }}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Resolved — local toggle — sized to match the Select controls */}
        <ButtonGroup
          size="small"
          sx={{
            height: 40,
            width: { xs: '100%', md: 'auto' },
            '& .MuiButton-root': {
              textTransform: 'none',
              fontSize: '0.85rem',
              fontWeight: 500,
              minWidth: 0,
              flex: { xs: 1, md: 'unset' },
              px: 2,
              borderColor: COLORS.border.default,
              color: COLORS.text.secondary,
            },
          }}
        >
          {[
            { label: 'All', value: null },
            { label: 'Resolved', value: true },
            { label: 'Unresolved', value: false },
          ].map((opt) => (
            <Button
              key={String(opt.value)}
              onClick={() => setResolvedFilter(opt.value)}
              sx={{
                ...(resolvedFilter === opt.value && {
                  backgroundColor: 'rgba(77, 212, 232, 0.12)',
                  color: COLORS.neon.cyan,
                  borderColor: `${COLORS.neon.cyan} !important`,
                }),
              }}
            >
              {opt.label}
            </Button>
          ))}
        </ButtonGroup>

        {/* Closer — linked to FilterContext (uses closerId values, displays names) */}
        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 180 }, maxWidth: { xs: '100%', md: 320 } }}>
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

        {/* Call Outcome — local multi-select */}
        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 180 }, maxWidth: { xs: '100%', md: 320 } }}>
          <Select
            multiple
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
            displayEmpty
            renderValue={(sel) => {
              if (!sel || sel.length === 0) return <em style={{ color: COLORS.text.secondary }}>All Outcomes</em>;
              return (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sel.map((o) => (
                    <Chip key={o} label={o} size="small"
                      sx={{
                        height: 22, fontSize: '0.72rem',
                        backgroundColor: 'rgba(184, 77, 255, 0.15)', color: COLORS.neon.purple,
                        border: '1px solid rgba(184, 77, 255, 0.3)',
                        '& .MuiChip-deleteIcon': { color: COLORS.neon.purple, fontSize: '0.85rem', '&:hover': { color: COLORS.text.primary } },
                      }}
                      onDelete={(e) => { e.stopPropagation(); setOutcomeFilter(outcomeFilter.filter((x) => x !== o)); }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ))}
                </Box>
              );
            }}
            endAdornment={outcomeFilter.length > 0 ? <ClearButton onClick={() => setOutcomeFilter([])} /> : null}
            sx={filterSelectSx(COLORS.neon.purple, outcomeFilter.length > 0)}
            MenuProps={{ PaperProps: { sx: { backgroundColor: COLORS.bg.secondary, border: `1px solid ${COLORS.border.default}`, maxHeight: 300 } } }}
          >
            {CALL_OUTCOMES.map((o) => (
              <MenuItem key={o} value={o} sx={{ color: COLORS.text.primary, '&.Mui-selected': { backgroundColor: 'rgba(184, 77, 255, 0.08)' }, '&.Mui-selected:hover': { backgroundColor: 'rgba(184, 77, 255, 0.12)' } }}>{o}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Date Range — linked to FilterContext */}
        <DateRangeFilter />

        {/* Row count + Download */}
        <Box sx={{ ml: { xs: 0, md: 'auto' }, width: { xs: '100%', md: 'auto' }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
            {filteredRows.length} of {rows.length} records
          </Typography>
          <Button
            size="small"
            startIcon={<FileDownloadIcon sx={{ fontSize: 16 }} />}
            disabled={filteredRows.length === 0}
            onClick={() => {
              const header = ['Objection Type', 'Resolved', 'Closer', 'Call Outcome', 'Date', 'Recording URL'];
              const csvRows = filteredRows.map((r) => [
                r.objectionType,
                r.resolved ? 'Resolved' : 'Unresolved',
                r.closer,
                r.callOutcome,
                r.appointmentDate,
                r.recordingUrl || '',
              ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
              const csv = [header.join(','), ...csvRows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `objections-${dayjs().format('YYYY-MM-DD')}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              textTransform: 'none',
              fontSize: '0.78rem',
              fontWeight: 500,
              color: COLORS.neon.cyan,
              borderColor: COLORS.border.default,
              px: 1.5,
              '&:hover': { borderColor: COLORS.neon.cyan, backgroundColor: 'rgba(77, 212, 232, 0.08)' },
              '&.Mui-disabled': { color: COLORS.text.muted, borderColor: COLORS.border.subtle },
            }}
            variant="outlined"
          >
            Download
          </Button>
        </Box>
      </Box>
      </Collapse>

      {/* ─── Data Table ────────────────────────────────────────────────── */}
      <Box ref={tableAreaRef}>
      {filteredRows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography sx={{ color: COLORS.text.muted }}>No records match the current filters</Typography>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              width: '100%',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              borderRadius: 1,
              border: `1px solid ${COLORS.border.subtle}`,
            }}
          >
            <Box
              component="table"
              sx={{
                width: '100%',
                minWidth: 700,
                borderCollapse: 'collapse',
                '& th, & td': {
                  padding: '10px 14px',
                  textAlign: 'left',
                  borderBottom: `1px solid ${COLORS.border.subtle}`,
                },
                '& th': {
                  color: COLORS.text.secondary,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  backgroundColor: COLORS.bg.tertiary,
                },
                '& td': {
                  color: COLORS.text.primary,
                  fontSize: '0.825rem',
                },
                '& tr:last-child td': {
                  borderBottom: 'none',
                },
                '& tr:hover td': {
                  backgroundColor: 'rgba(77, 212, 232, 0.03)',
                },
              }}
            >
              <thead>
                <tr>
                  <th>Objection Type</th>
                  <th style={{ textAlign: 'center' }}>Resolved</th>
                  <th>Closer</th>
                  <th>Call Outcome</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'center' }}>Recording</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 500 }}>{row.objectionType}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block',
                          width: 82,
                          textAlign: 'center',
                          px: 1,
                          py: 0.3,
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          backgroundColor: row.resolved
                            ? 'rgba(107, 207, 127, 0.12)'
                            : 'rgba(255, 77, 109, 0.12)',
                          color: row.resolved ? COLORS.neon.green : COLORS.neon.red,
                          border: `1px solid ${row.resolved
                            ? 'rgba(107, 207, 127, 0.25)'
                            : 'rgba(255, 77, 109, 0.25)'}`,
                        }}
                      >
                        {row.resolved ? 'Resolved' : 'Unresolved'}
                      </Box>
                    </td>
                    <td>{row.closer}</td>
                    <td style={{ color: OUTCOME_COLORS[row.callOutcome] || COLORS.text.primary, fontWeight: 500 }}>
                      {row.callOutcome}
                    </td>
                    <td>{formatDate(row.appointmentDate)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.recordingUrl ? (
                        <a
                          href={row.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: COLORS.neon.cyan, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <OpenInNewIcon sx={{ fontSize: '1rem' }} />
                        </a>
                      ) : (
                        <Typography component="span" sx={{ color: COLORS.text.muted, fontSize: '0.78rem' }}>{'\u2014'}</Typography>
                      )}
                    </td>
                  </tr>
                ))}
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
                <Button
                  size="small"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  sx={{
                    textTransform: 'none', fontSize: '0.8rem', fontWeight: 500, minWidth: 0, px: 1.5,
                    color: page === 0 ? COLORS.text.muted : COLORS.neon.cyan,
                    borderColor: COLORS.border.default,
                    '&.Mui-disabled': { color: COLORS.text.muted },
                  }}
                  variant="outlined"
                >
                  Previous
                </Button>
                <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', px: 1 }}>
                  {page + 1} / {totalPages}
                </Typography>
                <Button
                  size="small"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  sx={{
                    textTransform: 'none', fontSize: '0.8rem', fontWeight: 500, minWidth: 0, px: 1.5,
                    color: page >= totalPages - 1 ? COLORS.text.muted : COLORS.neon.cyan,
                    borderColor: COLORS.border.default,
                    '&.Mui-disabled': { color: COLORS.text.muted },
                  }}
                  variant="outlined"
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
      </Box>

    </Box>
  );
}
