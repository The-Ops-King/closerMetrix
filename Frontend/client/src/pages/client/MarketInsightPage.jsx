/**
 * MARKET INSIGHT PAGE — INSIGHT+ ONLY
 *
 * "What are my prospects actually saying?"
 *
 * Two sections:
 *   1. Summary scorecards (4): Calls Analyzed, Avg Pain/Goal Discovery, Data Coverage
 *   2. Market Pulse (AI): Condensed themes with counts — "100 people said X, 50 said Y"
 *   3. Raw Pains + Goals tables — date, closer, exact text from each call
 *
 * Market Pulse uses Claude Sonnet to cluster similar statements.
 * It's non-blocking — if AI fails, raw tables still render.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import ScorecardGrid from '../../components/scorecards/ScorecardGrid';
import TierGate from '../../components/TierGate';
import { apiPost } from '../../utils/api';

// ── Pulse Skeleton — loading state for theme list ─────────────────

function PulseSkeleton() {
  const widths = ['90%', '75%', '60%', '45%', '30%'];
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1.5, px: 1.5 }}>
      {widths.map((w, i) => (
        <Box
          key={i}
          sx={{
            height: 36,
            width: w,
            borderRadius: 1,
            backgroundColor: COLORS.bg.elevated,
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
            '@keyframes pulse': {
              '0%, 100%': { opacity: 0.4 },
              '50%': { opacity: 0.7 },
            },
          }}
        />
      ))}
    </Box>
  );
}

// ── Theme List — ranked bars with count badge ─────────────────────

function ThemeList({ themes, accentColor, maxCount }) {
  if (!themes || themes.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, py: 1, px: 1.5 }}>
      {themes.map((t, i) => {
        const fillPct = maxCount > 0 ? (t.count / maxCount) * 100 : 0;
        return (
          <Box
            key={i}
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              py: 1,
              px: 1.5,
              borderRadius: 1,
              overflow: 'hidden',
              transition: 'background-color 0.15s',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' },
            }}
          >
            {/* Proportional background fill */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${fillPct}%`,
                backgroundColor: accentColor,
                opacity: 0.08,
                borderRadius: 1,
                transition: 'width 0.6s ease',
              }}
            />
            {/* Count badge */}
            <Box
              sx={{
                position: 'relative',
                minWidth: 40,
                textAlign: 'center',
                px: 1,
                py: 0.25,
                borderRadius: 1,
                backgroundColor: accentColor,
                opacity: 0.9,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: COLORS.text.inverse,
                  lineHeight: 1.4,
                }}
              >
                {t.count}
              </Typography>
            </Box>
            {/* Theme text */}
            <Typography
              sx={{
                position: 'relative',
                fontSize: '0.85rem',
                color: COLORS.text.primary,
                lineHeight: 1.4,
              }}
            >
              {t.theme}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// ── AI Badge — small purple indicator ─────────────────────────────

function AiBadge() {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 0.75,
        py: 0.15,
        borderRadius: 0.75,
        backgroundColor: 'rgba(184, 77, 255, 0.15)',
        border: `1px solid rgba(184, 77, 255, 0.3)`,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.6rem',
          fontWeight: 700,
          color: COLORS.neon.purple,
          letterSpacing: '0.08em',
          lineHeight: 1.4,
        }}
      >
        AI
      </Typography>
    </Box>
  );
}

// ── Reusable raw voice table ──────────────────────────────────────

function VoiceTable({ rows, accentColor, emptyLabel }) {
  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
          No {emptyLabel} data in the last 30 days.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        maxHeight: 600,
        overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: COLORS.border.default,
          borderRadius: 3,
        },
      }}
    >
      {/* Header row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '70px 1fr', md: '100px 120px 120px 1fr' },
          gap: 1.5,
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${COLORS.border.default}`,
          position: 'sticky',
          top: 0,
          backgroundColor: COLORS.bg.tertiary,
          zIndex: 1,
        }}
      >
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Date
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: { xs: 'none', md: 'block' } }}>
          Closer
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: { xs: 'none', md: 'block' } }}>
          Prospect
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          What They Said
        </Typography>
      </Box>

      {/* Data rows */}
      {rows.map((row, i) => (
        <Box
          key={`${row.callId}-${i}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '70px 1fr', md: '100px 120px 120px 1fr' },
            gap: 1.5,
            px: 1.5,
            py: 1.25,
            borderBottom: `1px solid ${COLORS.border.subtle}`,
            transition: 'background-color 0.15s',
            '&:hover': {
              backgroundColor: COLORS.bg.elevated,
            },
          }}
        >
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            {row.date}
          </Typography>
          <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 500, display: { xs: 'none', md: 'block' } }}>
            {row.closerName}
          </Typography>
          <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', display: { xs: 'none', md: 'block' } }}>
            {row.prospectName}
          </Typography>
          <Typography
            sx={{
              color: COLORS.text.primary,
              fontSize: '0.85rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {/* On mobile, show closer name inline before the text */}
            <Box component="span" sx={{ display: { xs: 'inline', md: 'none' }, color: accentColor, fontWeight: 600, fontSize: '0.75rem', mr: 0.5 }}>
              {row.closerName}:
            </Box>
            {row.text}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function MarketInsightPage() {
  const { tier, token, mode, adminViewClientId } = useAuth();
  const isAdmin = mode === 'admin';
  const hasAccess = meetsMinTier(tier, 'insight');
  const { data, isLoading, error } = useMetrics('market-insight', { enabled: hasAccess });

  const sections = data?.sections || {};
  const tables = data?.tables || {};

  // ── Market Pulse AI state ──
  const [painThemes, setPainThemes] = useState(null);
  const [goalThemes, setGoalThemes] = useState(null);
  const [pulseLoading, setPulseLoading] = useState({ pains: false, goals: false });
  const [pulseError, setPulseError] = useState({ pains: null, goals: null });

  // Fingerprint to prevent duplicate fetches
  const lastFingerprintRef = useRef('');

  /**
   * Fetch condensed themes from the Market Pulse API.
   * Non-blocking — errors are caught and displayed subtly.
   */
  const fetchPulse = useCallback(async (type, texts, force = false) => {
    if (!texts || texts.length === 0) return;

    setPulseLoading(prev => ({ ...prev, [type]: true }));
    setPulseError(prev => ({ ...prev, [type]: null }));

    try {
      const authOpts = token ? { token } : {};
      if (isAdmin && adminViewClientId) authOpts.viewClientId = adminViewClientId;
      const result = await apiPost('/dashboard/market-pulse', { texts, type, force }, authOpts);
      if (result.success && result.data?.themes) {
        if (type === 'pains') setPainThemes(result.data.themes);
        else setGoalThemes(result.data.themes);
      }
    } catch (err) {
      setPulseError(prev => ({ ...prev, [type]: err.message || 'AI analysis failed' }));
    } finally {
      setPulseLoading(prev => ({ ...prev, [type]: false }));
    }
  }, [token, isAdmin, adminViewClientId]);

  /** Admin: force-refresh all AI themes (bypasses cache) */
  const handleForceRefresh = useCallback(() => {
    const painTexts = (tables.pains || []).map(r => r.text).filter(Boolean);
    const goalTexts = (tables.goals || []).map(r => r.text).filter(Boolean);
    if (painTexts.length > 0) fetchPulse('pains', painTexts, true);
    if (goalTexts.length > 0) fetchPulse('goals', goalTexts, true);
  }, [tables.pains, tables.goals, fetchPulse]);

  // Trigger Market Pulse when raw data loads
  useEffect(() => {
    if (!tables.pains && !tables.goals) return;

    // Build fingerprint from text count to avoid re-fetching same data
    const fp = `${(tables.pains || []).length}:${(tables.goals || []).length}`;
    if (fp === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fp;

    // Extract raw text arrays
    const painTexts = (tables.pains || []).map(r => r.text).filter(Boolean);
    const goalTexts = (tables.goals || []).map(r => r.text).filter(Boolean);

    if (painTexts.length > 0) fetchPulse('pains', painTexts);
    if (goalTexts.length > 0) fetchPulse('goals', goalTexts);
  }, [tables.pains, tables.goals, fetchPulse]);

  // Max counts for proportional fill bars
  const painMax = painThemes ? Math.max(...painThemes.map(t => t.count), 1) : 1;
  const goalMax = goalThemes ? Math.max(...goalThemes.map(t => t.count), 1) : 1;

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
            Market Insight
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
            What are your prospects saying? — Last 30 Days
          </Typography>
        </Box>
        {isAdmin && data && (
          <Box
            component="button"
            onClick={handleForceRefresh}
            disabled={pulseLoading.pains || pulseLoading.goals}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.75, mt: 0.5,
              backgroundColor: 'rgba(184, 77, 255, 0.1)',
              border: '1px solid rgba(184, 77, 255, 0.3)',
              borderRadius: 1.5, cursor: 'pointer',
              color: COLORS.neon.purple, fontSize: '0.75rem', fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              transition: 'all 0.15s',
              '&:hover': { backgroundColor: 'rgba(184, 77, 255, 0.2)', borderColor: COLORS.neon.purple },
              '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
            }}
          >
            {(pulseLoading.pains || pulseLoading.goals) ? 'Refreshing...' : 'Refresh AI'}
          </Box>
        )}
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading market insight data...</Typography>
        </Box>
      )}

      {/* Error state */}
      {error && !data && (
        <Box
          sx={{
            textAlign: 'center', py: 8,
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            borderRadius: 2,
            border: '1px solid rgba(255, 51, 102, 0.2)',
          }}
        >
          <Typography sx={{ color: COLORS.neon.red, mb: 1 }}>
            Failed to load market insight data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Dashboard content */}
      {data && (
      <TierGate requiredTier="insight" label="market insight analytics">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

          {/* Section 1: Summary Scorecards */}
          <ScorecardGrid
            title="Summary"
            metrics={sections.summary}
            glowColor={COLORS.neon.cyan}
            columns={4}
          />

          {/* Section 2: Market Pulse (AI Themes) */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
              alignItems: 'start',
            }}
          >
            {/* Pains Themes */}
            <Box
              sx={{
                backgroundColor: COLORS.bg.secondary,
                border: `1px solid ${COLORS.border.subtle}`,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${COLORS.border.subtle}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 3, height: 18, backgroundColor: COLORS.neon.red, borderRadius: 1 }} />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: COLORS.text.secondary,
                  }}
                >
                  Market Pulse — Pains
                </Typography>
                <AiBadge />
                {painThemes && (
                  <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', ml: 'auto' }}>
                    {painThemes.length} themes
                  </Typography>
                )}
              </Box>
              {pulseLoading.pains && <PulseSkeleton />}
              {!pulseLoading.pains && pulseError.pains && (
                <Box sx={{ py: 2, px: 2 }}>
                  <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
                    AI analysis unavailable
                  </Typography>
                </Box>
              )}
              {!pulseLoading.pains && !pulseError.pains && painThemes && (
                <ThemeList themes={painThemes} accentColor={COLORS.neon.red} maxCount={painMax} />
              )}
              {!pulseLoading.pains && !pulseError.pains && !painThemes && (tables.pains || []).length === 0 && (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
                    No pain data to analyze.
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Goals Themes */}
            <Box
              sx={{
                backgroundColor: COLORS.bg.secondary,
                border: `1px solid ${COLORS.border.subtle}`,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${COLORS.border.subtle}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 3, height: 18, backgroundColor: COLORS.neon.green, borderRadius: 1 }} />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: COLORS.text.secondary,
                  }}
                >
                  Market Pulse — Goals
                </Typography>
                <AiBadge />
                {goalThemes && (
                  <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', ml: 'auto' }}>
                    {goalThemes.length} themes
                  </Typography>
                )}
              </Box>
              {pulseLoading.goals && <PulseSkeleton />}
              {!pulseLoading.goals && pulseError.goals && (
                <Box sx={{ py: 2, px: 2 }}>
                  <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
                    AI analysis unavailable
                  </Typography>
                </Box>
              )}
              {!pulseLoading.goals && !pulseError.goals && goalThemes && (
                <ThemeList themes={goalThemes} accentColor={COLORS.neon.green} maxCount={goalMax} />
              )}
              {!pulseLoading.goals && !pulseError.goals && !goalThemes && (tables.goals || []).length === 0 && (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
                    No goal data to analyze.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* Section 3: Raw Pains + Goals tables */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
              alignItems: 'start',
            }}
          >
            {/* Pains Table */}
            <Box
              sx={{
                backgroundColor: COLORS.bg.secondary,
                border: `1px solid ${COLORS.border.subtle}`,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${COLORS.border.subtle}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 3, height: 18, backgroundColor: COLORS.neon.red, borderRadius: 1 }} />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: COLORS.text.secondary,
                  }}
                >
                  Raw Pains
                </Typography>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', ml: 'auto' }}>
                  {tables.pains?.length || 0} calls
                </Typography>
              </Box>
              <VoiceTable
                rows={tables.pains}
                accentColor={COLORS.neon.red}
                emptyLabel="pain"
              />
            </Box>

            {/* Goals Table */}
            <Box
              sx={{
                backgroundColor: COLORS.bg.secondary,
                border: `1px solid ${COLORS.border.subtle}`,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${COLORS.border.subtle}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 3, height: 18, backgroundColor: COLORS.neon.green, borderRadius: 1 }} />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: COLORS.text.secondary,
                  }}
                >
                  Raw Goals
                </Typography>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', ml: 'auto' }}>
                  {tables.goals?.length || 0} calls
                </Typography>
              </Box>
              <VoiceTable
                rows={tables.goals}
                accentColor={COLORS.neon.green}
                emptyLabel="goal"
              />
            </Box>
          </Box>

        </Box>
      </TierGate>
      )}
    </Box>
  );
}
