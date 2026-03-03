/**
 * TOP BAR
 *
 * Horizontal bar at the top of the content area.
 * Shows: company name, tier badge, filter controls, and CSV download button.
 * Filters shown depend on the current tier.
 */

import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import { useLocation } from 'react-router-dom';
import { COLORS, LAYOUT } from '../../theme/constants';
import { meetsMinTier } from '../../utils/tierConfig';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { apiGet } from '../../utils/api';
import TierBadge from './TierBadge';
import DateRangeFilter from '../filters/DateRangeFilter';
import CloserFilter from '../filters/CloserFilter';
import ObjectionTypeFilter from '../filters/ObjectionTypeFilter';
import RiskCategoryFilter from '../filters/RiskCategoryFilter';

/**
 * Convert an array of row objects to a CSV string.
 * Handles proper escaping of commas, quotes, and newlines in values.
 */
function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const escapeField = (val) => {
    if (val == null) return '';
    const str = String(val);
    // Wrap in quotes if the value contains commas, quotes, or newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeField).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeField(row[h])).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Trigger a browser file download from a string.
 */
function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TopBar({ companyName, tier, onMenuClick }) {
  const location = useLocation();
  const isObjectionsPage = location.pathname.includes('/objections');
  const isViolationsPage = location.pathname.includes('/violations');
  const isMarketInsightPage = location.pathname.includes('/market-insight');
  const isDataAnalysisPage = location.pathname.includes('/data-analysis');
  const isSettingsPage = location.pathname.endsWith('/settings');
  const { token, mode, adminViewClientId } = useAuth();
  const { queryParams, dateRange } = useFilters();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      // Build auth options matching the current access mode
      const authOptions = {};
      if (mode === 'client') {
        authOptions.token = token;
      } else if (mode === 'admin' && adminViewClientId) {
        authOptions.viewClientId = adminViewClientId;
      }
      // Admin key is auto-injected by apiGet from sessionStorage

      const res = await apiGet('/dashboard/export-calls', queryParams, authOptions);

      if (!res.success || !res.data || !res.data.rows || res.data.rows.length === 0) {
        // Nothing to download — silently stop
        return;
      }

      const csv = rowsToCsv(res.data.rows);
      const filename = `calls-${dateRange.start}-to-${dateRange.end}.csv`;
      downloadCsv(csv, filename);
    } catch (err) {
      // Log but don't crash — user sees the button stop spinning
      console.error('CSV download failed:', err.message);
    } finally {
      setDownloading(false);
    }
  }, [token, mode, adminViewClientId, queryParams, dateRange]);

  return (
    <Box
      sx={{
        minHeight: LAYOUT.topBarHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        px: { xs: 1.5, md: 3 },
        py: { xs: 1, md: 0 },
        gap: { xs: 1, md: 0 },
        borderBottom: `1px solid ${COLORS.border.subtle}`,
        backgroundColor: COLORS.bg.secondary,
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Left: Hamburger (mobile) + Company name + tier badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 } }}>
        {onMenuClick && (
          <IconButton
            onClick={onMenuClick}
            size="small"
            sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.cyan } }}
          >
            <MenuIcon />
          </IconButton>
        )}
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: COLORS.text.primary,
            fontSize: { xs: '1.05rem', md: '1rem' },
          }}
        >
          {companyName || 'Dashboard'}
        </Typography>
        {tier && <TierBadge tier={tier} size="sm" />}
      </Box>

      {/* Right: Filter controls + Download button — wraps to full width on mobile */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' } }}>
        {/* Market Insight uses auto last-30-days; Settings has no data filters */}
        {!isMarketInsightPage && !isSettingsPage && !isDataAnalysisPage && (
          <>
            {meetsMinTier(tier, 'insight') ? (
              <CloserFilter />
            ) : (
              <Tooltip title="Upgrade to Insight to filter by closer" arrow>
                <span>
                  <CloserFilter disabled />
                </span>
              </Tooltip>
            )}
            {isObjectionsPage && meetsMinTier(tier, 'insight') && (
              <ObjectionTypeFilter />
            )}
            {isViolationsPage && meetsMinTier(tier, 'executive') && (
              <RiskCategoryFilter />
            )}
            <DateRangeFilter />
          </>
        )}
        {!isSettingsPage && !isDataAnalysisPage && <Tooltip title="Download filtered calls as CSV" arrow>
          <IconButton
            onClick={handleDownload}
            disabled={downloading}
            size="small"
            sx={{
              color: COLORS.text.secondary,
              border: `1px solid ${COLORS.border.subtle}`,
              borderRadius: 1,
              px: 1,
              '&:hover': {
                color: COLORS.neon.cyan,
                borderColor: COLORS.neon.cyan,
                backgroundColor: 'rgba(77, 212, 232, 0.08)',
              },
            }}
          >
            {downloading ? (
              <CircularProgress size={18} sx={{ color: COLORS.neon.cyan }} />
            ) : (
              <FileDownloadOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>}
      </Box>
    </Box>
  );
}
