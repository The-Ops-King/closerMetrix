/**
 * SETTINGS PAGE — Client Dashboard
 *
 * Self-service configuration page with accordion sections:
 *   - Team (Closers) — basic: full CRUD
 *   - Offers & Products — basic: manage offer list
 *   - KPI Targets — insight: set performance targets
 *   - Notifications & Alerts — insight: email prefs + threshold alerts
 *   - AI Prompts — executive: edit all 5 AI prompts + context notes
 *   - Script — executive: edit script_template
 *   - Commission Builder — insight: coming soon placeholder
 *
 * Data: GET /api/dashboard/settings (client config + closers)
 * Saves: PUT /api/dashboard/settings (settings_json)
 *         PUT /api/backend/clients/:clientId (AI prompts, script)
 *         POST/PUT/DELETE /api/backend/clients/:clientId/closers (team CRUD)
 */

import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GroupIcon from '@mui/icons-material/Group';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PsychologyIcon from '@mui/icons-material/Psychology';
import DescriptionIcon from '@mui/icons-material/Description';
import PaidIcon from '@mui/icons-material/Paid';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { TIER_LABELS } from '../../../../shared/tierDefinitions';
import { apiGet, apiPut, apiPost, apiDelete, apiPatch } from '../../utils/api';
import SectionHeader from '../../components/SectionHeader';

// ── Helpers ──────────────────────────────────────────────────

/** Generate a simple UUID v4 for local IDs */
function uuid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Default settings_json shape */
const AI_PROVIDERS = [
  { key: 'claude', label: 'Claude', subtitle: 'Anthropic', color: COLORS.neon.amber },
  { key: 'chatgpt', label: 'ChatGPT', subtitle: 'OpenAI', color: COLORS.neon.green },
  { key: 'gemini', label: 'Gemini', subtitle: 'Google', color: COLORS.neon.cyan },
];

const DEFAULT_SETTINGS = {
  ai_provider: 'claude',
  kpi_targets: {
    show_rate: null,
    close_rate: null,
    revenue_per_month: null,
    cash_collected_per_month: null,
    avg_deal_size: null,
  },
  offers: [],
  notifications: {
    weekly_enabled: true,
    monthly_enabled: false,
    monthly_day: 1,              // day of month (1-28)
    include_sections: ['overview', 'financial', 'attendance'],
    alerts: [],
    close_watches: [],
    ftc_alert_recipients: '',
    ftc_alerts_enabled: true,
    weekly_recipients: '',
    monthly_recipients: '',
    daily_enabled: true,
    daily_recipients: '',
  },
  commission: null,
};

const AVAILABLE_SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'financial', label: 'Financial' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'callOutcomes', label: 'Call Outcomes' },
  { key: 'salesCycle', label: 'Sales Cycle' },
  { key: 'objections', label: 'Objections' },
  { key: 'marketInsight', label: 'Market Insight' },
  { key: 'violations', label: 'Violations' },
];

const ALERT_METRICS = [
  { key: 'show_rate', label: 'Show Rate', format: 'percent' },
  { key: 'close_rate', label: 'Close Rate', format: 'percent' },
  { key: 'revenue_per_month', label: 'Revenue/Month', format: 'currency' },
  { key: 'cash_collected_per_month', label: 'Cash/Month', format: 'currency' },
  { key: 'avg_deal_size', label: 'Avg Deal Size', format: 'currency' },
];

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// ── Styled Sub-Components ────────────────────────────────────

/** Accordion section wrapper with tier gating */
function SettingsSection({ title, icon, minTier, tier, children, color = COLORS.neon.cyan }) {
  const [expanded, setExpanded] = useState(false);
  const locked = !meetsMinTier(tier, minTier);
  const tierLabel = TIER_LABELS[minTier] || minTier;
  const tierColor = COLORS.tier?.[minTier] || COLORS.text.muted;

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${locked ? COLORS.border.subtle : COLORS.border.subtle}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        overflow: 'hidden',
        opacity: locked ? 0.7 : 1,
      }}
    >
      {/* Section header — clickable */}
      <Box
        onClick={() => !locked && setExpanded((p) => !p)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2.5,
          py: 2,
          cursor: locked ? 'default' : 'pointer',
          '&:hover': locked ? {} : { backgroundColor: 'rgba(255,255,255,0.02)' },
        }}
      >
        <Box
          sx={{
            width: 4,
            height: 24,
            backgroundColor: locked ? COLORS.text.muted : color,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        {icon && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: locked ? COLORS.text.muted : color, flexShrink: 0 }}>
            {icon}
          </Box>
        )}
        <Typography
          sx={{
            color: locked ? COLORS.text.muted : COLORS.text.primary,
            fontSize: '1rem',
            fontWeight: 600,
            letterSpacing: '0.03em',
            flex: 1,
          }}
        >
          {title}
        </Typography>

        {locked ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`${tierLabel}+`}
              size="small"
              sx={{
                backgroundColor: `${tierColor}15`,
                color: tierColor,
                fontSize: '0.7rem',
                fontWeight: 600,
                height: 22,
              }}
            />
            <LockOutlinedIcon sx={{ fontSize: '1rem', color: COLORS.text.muted }} />
          </Box>
        ) : expanded ? (
          <ExpandLessIcon sx={{ color: COLORS.text.muted }} />
        ) : (
          <ExpandMoreIcon sx={{ color: COLORS.text.muted }} />
        )}
      </Box>

      {/* Section content */}
      {expanded && !locked && (
        <Box sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

/** Styled save button with success feedback */
function SaveButton({ onClick, saving, saved, label = 'Save' }) {
  return (
    <Button
      onClick={onClick}
      disabled={saving}
      variant="contained"
      size="small"
      startIcon={saved ? <CheckCircleIcon /> : <SaveIcon />}
      sx={{
        backgroundColor: saved ? COLORS.neon.green : COLORS.neon.cyan,
        color: COLORS.bg.primary,
        fontWeight: 600,
        fontSize: '0.8rem',
        textTransform: 'none',
        '&:hover': {
          backgroundColor: saved ? COLORS.neon.green : COLORS.neon.cyan,
          filter: 'brightness(1.1)',
        },
        '&:disabled': {
          backgroundColor: COLORS.text.muted,
          color: COLORS.bg.primary,
        },
      }}
    >
      {saving ? 'Saving...' : saved ? 'Saved' : label}
    </Button>
  );
}

/** Styled text input matching the Tron theme */
function TronTextField(props) {
  return (
    <TextField
      variant="outlined"
      size="small"
      {...props}
      sx={{
        '& .MuiOutlinedInput-root': {
          backgroundColor: COLORS.bg.tertiary,
          color: COLORS.text.primary,
          fontSize: '0.85rem',
          '& fieldset': { borderColor: COLORS.border.subtle },
          '&:hover fieldset': { borderColor: COLORS.border.default },
          '&.Mui-focused fieldset': { borderColor: COLORS.neon.cyan },
        },
        '& .MuiInputLabel-root': {
          color: COLORS.text.muted,
          fontSize: '0.8rem',
        },
        '& .MuiInputLabel-root.Mui-focused': {
          color: COLORS.neon.cyan,
        },
        ...props.sx,
      }}
    />
  );
}

// ── AI Provider Section ──────────────────────────────────────
function AiProviderSection({ settings, setSettings, saveSettingsJson, setAiProvider }) {
  const [pendingProvider, setPendingProvider] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentProvider = settings.ai_provider || 'claude';
  const selectedProvider = pendingProvider || currentProvider;
  const hasUnsavedChange = pendingProvider !== null && pendingProvider !== currentProvider;

  const handleSave = async () => {
    if (!hasUnsavedChange) return;
    setSaving(true);
    try {
      await saveSettingsJson({ ai_provider: pendingProvider });
      setAiProvider(pendingProvider);
      setPendingProvider(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {AI_PROVIDERS.map((p) => {
          const selected = selectedProvider === p.key;
          return (
            <Box
              key={p.key}
              onClick={() => {
                if (p.key === currentProvider) {
                  setPendingProvider(null);
                } else {
                  setPendingProvider(p.key);
                }
                setSaved(false);
              }}
              sx={{
                flex: '1 1 140px',
                maxWidth: 200,
                p: 2,
                borderRadius: 2,
                cursor: 'pointer',
                border: `2px solid ${selected ? p.color : COLORS.border.subtle}`,
                bgcolor: selected ? `${p.color}15` : COLORS.bg.secondary,
                transition: 'all 0.2s',
                '&:hover': { borderColor: p.color, boxShadow: `0 0 12px ${p.color}40` },
              }}
            >
              <Typography sx={{ fontWeight: 700, color: selected ? p.color : COLORS.text.primary, fontSize: '1rem' }}>
                {p.label}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: COLORS.text.secondary, mt: 0.5 }}>
                {p.subtitle}
              </Typography>
              {selected && (
                <CheckCircleIcon sx={{ color: p.color, fontSize: 18, mt: 1 }} />
              )}
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!hasUnsavedChange || saving}
          onClick={handleSave}
          sx={{
            bgcolor: hasUnsavedChange ? COLORS.neon.purple : COLORS.bg.elevated,
            '&:hover': { bgcolor: hasUnsavedChange ? `${COLORS.neon.purple}cc` : COLORS.bg.elevated },
            '&.Mui-disabled': { bgcolor: COLORS.bg.elevated, color: COLORS.text.muted },
          }}
        >
          {saving ? 'Saving...' : 'Save AI Provider'}
        </Button>
        {saved && (
          <Typography sx={{ color: COLORS.neon.green, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircleIcon sx={{ fontSize: 16 }} /> Saved
          </Typography>
        )}
      </Box>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function SettingsPage() {
  const { tier, clientId, token, mode, adminViewClientId, setKpiTargets, setAiProvider } = useAuth();

  // Resolve effective client ID and auth options for API calls
  const effectiveClientId = mode === 'admin' ? adminViewClientId : clientId;
  const authOptions = mode === 'admin'
    ? { adminKey: sessionStorage.getItem('adminApiKey'), viewClientId: adminViewClientId }
    : { token };

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [client, setClient] = useState(null);
  const [closers, setClosers] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Fetch settings data
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet('/dashboard/settings', null, authOptions);
      if (res.success && res.data) {
        setClient(res.data.client);
        setClosers(res.data.closers || []);
        const parsed = res.data.client?.parsed_settings;
        if (parsed) {
          setSettings((prev) => ({
            ...DEFAULT_SETTINGS,
            ...parsed,
            ai_provider: parsed.ai_provider || 'claude',
            kpi_targets: { ...DEFAULT_SETTINGS.kpi_targets, ...parsed.kpi_targets },
            notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
          }));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveClientId]);

  useEffect(() => {
    if (effectiveClientId) fetchSettings();
  }, [effectiveClientId, fetchSettings]);

  /** Save settings_json to server */
  const saveSettingsJson = async (updatedSettings) => {
    const merged = { ...settings, ...updatedSettings };
    setSettings(merged);
    await apiPut('/dashboard/settings', { settings_json: JSON.stringify(merged) }, authOptions);
    // Update AuthContext kpiTargets so charts reflect new targets immediately
    if (updatedSettings.kpi_targets) {
      setKpiTargets(merged.kpi_targets);
      // Sync revenue KPI target with projections goals
      const rev = merged.kpi_targets.revenue_per_month;
      if (rev != null && rev > 0) {
        try {
          await apiPut('/dashboard/goals', {
            monthly_goal: rev,
            quarterly_goal: rev * 3,
            yearly_goal: rev * 12,
          }, authOptions);
        } catch {
          // Goals sync is best-effort — don't fail the KPI save
        }
      }
    }
  };

  /** Save client fields (AI prompts, script, etc.) via client-facing endpoint */
  const saveClientFields = async (fields) => {
    await apiPut('/dashboard/client-config', fields, authOptions);
  };

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ color: COLORS.text.muted }}>Loading settings...</Typography>
      </Box>
    );
  }

  // Error state
  if (error && !client) {
    return (
      <Box sx={{ p: 3 }}>
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            borderRadius: 2,
            border: '1px solid rgba(255, 51, 102, 0.2)',
          }}
        >
          <Typography sx={{ color: COLORS.neon.red, mb: 1 }}>
            Failed to load settings
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Settings
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Manage your team, targets, notifications, and AI configuration
        </Typography>
      </Box>

      {/* Sections */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* 1. Team (Closers) — basic */}
        <SettingsSection title="Team (Closers)" icon={<GroupIcon fontSize="small" />} minTier="basic" tier={tier} color={COLORS.neon.cyan}>
          <TeamSection
            closers={closers}
            clientId={effectiveClientId}
            authOptions={authOptions}
            mode={mode}
            onRefresh={fetchSettings}
          />
        </SettingsSection>

        {/* 2. AI Provider — all tiers */}
        <SettingsSection title="AI Provider" icon={<SmartToyIcon fontSize="small" />} minTier="basic" tier={tier} color={COLORS.neon.purple}>
          <AiProviderSection
            settings={settings}
            setSettings={setSettings}
            saveSettingsJson={saveSettingsJson}
            setAiProvider={setAiProvider}
          />
        </SettingsSection>

        {/* 3. Offers & Products — basic */}
        <SettingsSection title="Offers & Products" icon={<StorefrontIcon fontSize="small" />} minTier="basic" tier={tier} color={COLORS.neon.amber}>
          <OffersSection
            offers={settings.offers || []}
            onSave={(offers) => saveSettingsJson({ offers })}
          />
        </SettingsSection>

        {/* 3. KPI Targets — insight */}
        <SettingsSection title="KPI Targets" icon={<TrackChangesIcon fontSize="small" />} minTier="insight" tier={tier} color={COLORS.neon.green}>
          <KpiSection
            targets={settings.kpi_targets}
            onSave={(kpi_targets) => saveSettingsJson({ kpi_targets })}
          />
        </SettingsSection>

        {/* 4. Notifications & Alerts — insight */}
        <SettingsSection title="Notifications & Alerts" icon={<NotificationsActiveIcon fontSize="small" />} minTier="insight" tier={tier} color={COLORS.neon.purple}>
          <NotificationsSection
            notifications={settings.notifications}
            closers={closers.filter((c) => (c.status || '').toLowerCase() === 'active')}
            onSave={(notifications) => saveSettingsJson({ notifications })}
          />
        </SettingsSection>

        {/* 5. AI Prompts — executive */}
        <SettingsSection title="AI Prompts" icon={<PsychologyIcon fontSize="small" />} minTier="executive" tier={tier} color={COLORS.neon.magenta}>
          <AiPromptsSection client={client} onSave={saveClientFields} />
        </SettingsSection>

        {/* 6. Script — executive */}
        <SettingsSection title="Script Template" icon={<DescriptionIcon fontSize="small" />} minTier="executive" tier={tier} color={COLORS.neon.red}>
          <ScriptSection client={client} onSave={saveClientFields} />
        </SettingsSection>

        {/* 7. Commission Builder — insight (coming soon) */}
        <SettingsSection title="Commission Builder" icon={<PaidIcon fontSize="small" />} minTier="insight" tier={tier} color={COLORS.neon.teal}>
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem' }}>
              Coming soon — commission structure builder and tracker
            </Typography>
          </Box>
        </SettingsSection>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pt: 3,
          pb: 2,
          borderTop: `1px solid ${COLORS.border.subtle}`,
          mt: 3,
        }}
      >
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
          Last updated: {new Date().toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ── 1. Team (Closers) ────────────────────────────────────────

function TeamSection({ closers, clientId, authOptions, mode, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newCloser, setNewCloser] = useState({ name: '' });
  const [editFields, setEditFields] = useState({ name: '' });

  // Use client-facing dashboard endpoints (authenticated via clientIsolation)
  const closerAuth = authOptions;

  const activeClosers = closers.filter((c) => (c.status || '').toLowerCase() === 'active');
  const inactiveClosers = closers.filter((c) => (c.status || '').toLowerCase() !== 'active');

  const handleAdd = async () => {
    if (!newCloser.name.trim()) return;
    setSaving(true);
    try {
      await apiPost('/dashboard/closers', newCloser, closerAuth);
      setNewCloser({ name: '' });
      setShowAdd(false);
      await onRefresh();
    } catch (err) {
      alert(`Failed to add closer: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (closerId) => {
    if (!editFields.name.trim()) return;
    setSaving(true);
    try {
      await apiPut(`/dashboard/closers/${closerId}`, editFields, closerAuth);
      setEditingId(null);
      await onRefresh();
    } catch (err) {
      alert(`Failed to update closer: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (closerId) => {
    if (!confirm('Deactivate this closer? They will no longer appear in reports.')) return;
    setSaving(true);
    try {
      await apiDelete(`/dashboard/closers/${closerId}`, closerAuth);
      await onRefresh();
    } catch (err) {
      alert(`Failed to deactivate closer: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async (closerId) => {
    setSaving(true);
    try {
      await apiPatch(`/dashboard/closers/${closerId}/reactivate`, {}, closerAuth);
      await onRefresh();
    } catch (err) {
      alert(`Failed to reactivate closer: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      {/* Add button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          onClick={() => setShowAdd(true)}
          startIcon={<PersonAddIcon />}
          size="small"
          sx={{
            color: COLORS.neon.cyan,
            borderColor: COLORS.neon.cyan,
            fontSize: '0.8rem',
            textTransform: 'none',
          }}
          variant="outlined"
        >
          Add Closer
        </Button>
      </Box>

      {/* Add form */}
      {showAdd && (
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-end',
            mb: 2,
            p: 2,
            backgroundColor: COLORS.bg.tertiary,
            borderRadius: 1.5,
            border: `1px solid ${COLORS.neon.cyan}30`,
          }}
        >
          <TronTextField
            label="Name"
            value={newCloser.name}
            onChange={(e) => setNewCloser((p) => ({ ...p, name: e.target.value }))}
            sx={{ flex: 1 }}
          />
          <Button
            onClick={handleAdd}
            disabled={saving || !newCloser.name.trim()}
            variant="contained"
            size="small"
            sx={{
              backgroundColor: COLORS.neon.cyan,
              color: COLORS.bg.primary,
              fontWeight: 600,
              textTransform: 'none',
              minWidth: 80,
            }}
          >
            {saving ? '...' : 'Add'}
          </Button>
          <Button
            onClick={() => { setShowAdd(false); setNewCloser({ name: '' }); }}
            size="small"
            sx={{ color: COLORS.text.muted, textTransform: 'none' }}
          >
            Cancel
          </Button>
        </Box>
      )}

      {/* Active closers */}
      {activeClosers.length === 0 && (
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem', py: 2, textAlign: 'center' }}>
          No active closers. Add one above to get started.
        </Typography>
      )}

      {activeClosers.map((closer) => (
        <Box
          key={closer.closer_id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 1.5,
            px: 2,
            borderBottom: `1px solid ${COLORS.border.subtle}`,
            '&:last-child': { borderBottom: 'none' },
          }}
        >
          {editingId === closer.closer_id ? (
            <>
              <TronTextField
                value={editFields.name}
                onChange={(e) => setEditFields((p) => ({ ...p, name: e.target.value }))}
                sx={{ flex: 1 }}
                size="small"
              />
              <IconButton
                onClick={() => handleEdit(closer.closer_id)}
                disabled={saving}
                sx={{ color: COLORS.neon.green }}
                size="small"
              >
                <SaveIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={() => setEditingId(null)}
                sx={{ color: COLORS.text.muted }}
                size="small"
              >
                <RestoreIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            <>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: COLORS.text.primary, fontSize: '0.9rem', fontWeight: 500 }}>
                  {closer.name}
                </Typography>
              </Box>
              <Chip
                label="Active"
                size="small"
                sx={{
                  backgroundColor: `${COLORS.neon.green}15`,
                  color: COLORS.neon.green,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  height: 22,
                }}
              />
              <IconButton
                onClick={() => {
                  setEditingId(closer.closer_id);
                  setEditFields({ name: closer.name });
                }}
                sx={{ color: COLORS.text.muted }}
                size="small"
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={() => handleDeactivate(closer.closer_id)}
                sx={{ color: COLORS.neon.red }}
                size="small"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
      ))}

      {/* Inactive closers */}
      {inactiveClosers.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{
              color: COLORS.text.muted,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              mb: 1,
            }}
          >
            Inactive Closers
          </Typography>
          {inactiveClosers.map((closer) => (
            <Box
              key={closer.closer_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 1,
                px: 2,
                opacity: 0.6,
                borderBottom: `1px solid ${COLORS.border.subtle}`,
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
                  {closer.name}
                </Typography>
              </Box>
              <Chip
                label="Inactive"
                size="small"
                sx={{
                  backgroundColor: `${COLORS.text.muted}15`,
                  color: COLORS.text.muted,
                  fontSize: '0.7rem',
                  height: 22,
                }}
              />
              <Button
                onClick={() => handleReactivate(closer.closer_id)}
                startIcon={<RestoreIcon />}
                size="small"
                sx={{ color: COLORS.neon.cyan, fontSize: '0.75rem', textTransform: 'none' }}
              >
                Reactivate
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── 2. Offers & Products ─────────────────────────────────────

function OffersSection({ offers, onSave }) {
  const [localOffers, setLocalOffers] = useState(offers);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { setLocalOffers(offers); }, [offers]);

  const handleAdd = () => {
    const newOffer = { id: uuid(), name: '', price: '', description: '' };
    setLocalOffers((prev) => [...prev, newOffer]);
    setEditingId(newOffer.id);
  };

  const handleUpdate = (id, field, value) => {
    setLocalOffers((prev) =>
      prev.map((o) => (o.id === id ? { ...o, [field]: value } : o))
    );
  };

  const handleRemove = (id) => {
    setLocalOffers((prev) => prev.filter((o) => o.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean up: ensure price is numeric
      const cleaned = localOffers
        .filter((o) => o.name.trim())
        .map((o) => ({
          ...o,
          price: typeof o.price === 'string' ? parseFloat(o.price) || 0 : o.price,
        }));
      await onSave(cleaned);
      setSaved(true);
      setEditingId(null);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`Failed to save offers: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      {localOffers.map((offer) => (
        <Box
          key={offer.id}
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            py: 1.5,
            borderBottom: `1px solid ${COLORS.border.subtle}`,
          }}
        >
          {editingId === offer.id ? (
            <>
              <TronTextField
                label="Offer Name"
                value={offer.name}
                onChange={(e) => handleUpdate(offer.id, 'name', e.target.value)}
                sx={{ flex: 2 }}
              />
              <TronTextField
                label="Price"
                type="number"
                value={offer.price}
                onChange={(e) => handleUpdate(offer.id, 'price', e.target.value)}
                sx={{ flex: 1 }}
              />
              <TronTextField
                label="Description"
                value={offer.description}
                onChange={(e) => handleUpdate(offer.id, 'description', e.target.value)}
                sx={{ flex: 2 }}
              />
              <IconButton
                onClick={() => setEditingId(null)}
                sx={{ color: COLORS.neon.green, mt: 0.5 }}
                size="small"
              >
                <CheckCircleIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={() => handleRemove(offer.id)}
                sx={{ color: COLORS.neon.red, mt: 0.5 }}
                size="small"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            <>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: COLORS.text.primary, fontSize: '0.9rem', fontWeight: 500 }}>
                  {offer.name || 'Unnamed Offer'}
                </Typography>
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                  {offer.price ? `$${Number(offer.price).toLocaleString()}` : 'No price'}{offer.description ? ` — ${offer.description}` : ''}
                </Typography>
              </Box>
              <IconButton
                onClick={() => setEditingId(offer.id)}
                sx={{ color: COLORS.text.muted }}
                size="small"
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={() => handleRemove(offer.id)}
                sx={{ color: COLORS.neon.red }}
                size="small"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
      ))}

      {localOffers.length === 0 && (
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem', py: 2, textAlign: 'center' }}>
          No offers configured. Add one to get started.
        </Typography>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
        <Button
          onClick={handleAdd}
          startIcon={<AddIcon />}
          size="small"
          sx={{ color: COLORS.neon.amber, fontSize: '0.8rem', textTransform: 'none' }}
        >
          Add Offer
        </Button>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </Box>
    </Box>
  );
}

// ── 3. KPI Targets ───────────────────────────────────────────

function KpiSection({ targets, onSave }) {
  const [local, setLocal] = useState(targets);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(targets); }, [targets]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean: convert string inputs to numbers
      const cleaned = {};
      for (const [key, val] of Object.entries(local)) {
        cleaned[key] = val === '' || val == null ? null : Number(val);
      }
      await onSave(cleaned);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`Failed to save KPI targets: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'show_rate', label: 'Show Rate Target', placeholder: '0.75', hint: 'As decimal (e.g. 0.75 = 75%)' },
    { key: 'close_rate', label: 'Close Rate Target', placeholder: '0.25', hint: 'As decimal (e.g. 0.25 = 25%)' },
    { key: 'revenue_per_month', label: 'Revenue/Month Target', placeholder: '50000', hint: 'Monthly revenue goal ($)' },
    { key: 'cash_collected_per_month', label: 'Cash/Month Target', placeholder: '30000', hint: 'Monthly cash goal ($)' },
    { key: 'avg_deal_size', label: 'Avg Deal Size Target', placeholder: '5000', hint: 'Target average deal size ($)' },
  ];

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          mb: 2,
        }}
      >
        {fields.map((f) => (
          <Box key={f.key}>
            <TronTextField
              label={f.label}
              placeholder={f.placeholder}
              type="number"
              inputProps={{ min: 0, step: f.key.includes('rate') ? 0.01 : 1 }}
              value={local[f.key] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || Number(v) >= 0) setLocal((p) => ({ ...p, [f.key]: v }));
              }}
              fullWidth
              helperText={f.hint}
              FormHelperTextProps={{ sx: { color: COLORS.text.muted, fontSize: '0.7rem' } }}
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </Box>
    </Box>
  );
}

// ── 4. Notifications & Alerts ────────────────────────────────

function NotificationsSection({ notifications, closers, onSave }) {
  const [local, setLocal] = useState(notifications);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(notifications); }, [notifications]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`Failed to save notification preferences: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAlert = () => {
    setLocal((prev) => ({
      ...prev,
      alerts: [
        ...(prev.alerts || []),
        {
          id: uuid(),
          metric: 'show_rate',
          operator: 'below',
          threshold: '',
          duration_days: 3,
          scope: 'team',
          closer_id: null,
          enabled: true,
        },
      ],
    }));
  };

  const handleUpdateAlert = (id, field, value) => {
    setLocal((prev) => ({
      ...prev,
      alerts: (prev.alerts || []).map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    }));
  };

  const handleRemoveAlert = (id) => {
    setLocal((prev) => ({
      ...prev,
      alerts: (prev.alerts || []).filter((a) => a.id !== id),
    }));
  };

  const handleAddWatch = () => {
    setLocal((prev) => ({
      ...prev,
      close_watches: [
        ...(prev.close_watches || []),
        {
          id: uuid(),
          closer_id: closers[0]?.closer_id || '',
          closer_name: closers[0]?.name || '',
          duration_type: 'days',
          duration_value: 30,
          close_watch_start_date: new Date().toISOString().slice(0, 10),
          until_kpi_met: false,
          enabled: true,
          watch_type: 'onboarding',
        },
      ],
    }));
  };

  const handleUpdateWatch = (id, field, value) => {
    setLocal((prev) => ({
      ...prev,
      close_watches: (prev.close_watches || []).map((w) => {
        if (w.id !== id) return w;
        const updated = { ...w, [field]: value };
        // Sync closer_name when closer_id changes
        if (field === 'closer_id') {
          const match = closers.find((c) => c.closer_id === value);
          updated.closer_name = match?.name || '';
        }
        return updated;
      }),
    }));
  };

  const handleRemoveWatch = (id) => {
    setLocal((prev) => ({
      ...prev,
      close_watches: (prev.close_watches || []).filter((w) => w.id !== id),
    }));
  };

  const toggleSection = (key) => {
    setLocal((prev) => {
      const sections = prev.include_sections || [];
      return {
        ...prev,
        include_sections: sections.includes(key)
          ? sections.filter((s) => s !== key)
          : [...sections, key],
      };
    });
  };

  const selectStyle = {
    backgroundColor: COLORS.bg.primary,
    color: COLORS.text.primary,
    fontSize: '0.85rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle },
  };

  const reportCardStyle = (enabled) => ({
    p: 2,
    borderRadius: 2,
    backgroundColor: enabled ? `${COLORS.neon.purple}08` : COLORS.bg.tertiary,
    border: `1px solid ${enabled ? `${COLORS.neon.purple}40` : COLORS.border.subtle}`,
    transition: 'all 0.2s ease',
  });

  return (
    <Box>
      {/* Weekly Report */}
      <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 600, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Email Reports
      </Typography>

      <Box sx={reportCardStyle(local.weekly_enabled)} mb={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: (local.weekly_enabled ?? true) ? 1.5 : 0 }}>
          <Box>
            <Typography sx={{ color: COLORS.text.primary, fontSize: '0.95rem', fontWeight: 600 }}>
              Weekly Report
            </Typography>
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
              Sent every Monday at 9:00 AM EST — this week vs last week
            </Typography>
          </Box>
          <Switch
            checked={local.weekly_enabled ?? true}
            onChange={(e) => setLocal((p) => ({ ...p, weekly_enabled: e.target.checked }))}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.neon.purple }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.neon.purple } }}
          />
        </Box>
        {(local.weekly_enabled ?? true) && (
          <TronTextField
            fullWidth
            placeholder="Recipients (comma-separated) — blank = primary contact"
            value={local.weekly_recipients || ''}
            onChange={(e) => setLocal((p) => ({ ...p, weekly_recipients: e.target.value }))}
          />
        )}
      </Box>

      {/* Monthly Report */}
      <Box sx={reportCardStyle(local.monthly_enabled)} mb={3}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: local.monthly_enabled ? 2 : 0 }}>
          <Box>
            <Typography sx={{ color: COLORS.text.primary, fontSize: '0.95rem', fontWeight: 600 }}>
              Monthly Report
            </Typography>
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
              Sends on the 1st of the month at 9:00 AM EST — this month vs last month
            </Typography>
          </Box>
          <Switch
            checked={local.monthly_enabled ?? false}
            onChange={(e) => setLocal((p) => ({ ...p, monthly_enabled: e.target.checked }))}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.neon.purple }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.neon.purple } }}
          />
        </Box>
        {local.monthly_enabled && (
          <TronTextField
            fullWidth
            placeholder="Recipients (comma-separated) — blank = primary contact"
            value={local.monthly_recipients || ''}
            onChange={(e) => setLocal((p) => ({ ...p, monthly_recipients: e.target.value }))}
          />
        )}
      </Box>

      {/* Included sections */}
      <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 600, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Report Sections
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {AVAILABLE_SECTIONS.map((sec) => {
          const active = (local.include_sections || []).includes(sec.key);
          return (
            <Chip
              key={sec.key}
              label={sec.label}
              onClick={() => toggleSection(sec.key)}
              sx={{
                backgroundColor: active ? `${COLORS.neon.purple}20` : COLORS.bg.tertiary,
                color: active ? COLORS.neon.purple : COLORS.text.muted,
                border: `1px solid ${active ? `${COLORS.neon.purple}40` : COLORS.border.subtle}`,
                cursor: 'pointer',
                fontSize: '0.8rem',
                '&:hover': { backgroundColor: `${COLORS.neon.purple}10` },
              }}
            />
          );
        })}
      </Box>

      {/* Metric threshold alerts */}
      <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 600, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Metric Alerts
      </Typography>
      {(local.alerts || []).map((alert) => (
        <Box
          key={alert.id}
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            mb: 1,
            p: 1.5,
            backgroundColor: COLORS.bg.tertiary,
            borderRadius: 1.5,
          }}
        >
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={alert.metric}
              onChange={(e) => handleUpdateAlert(alert.id, 'metric', e.target.value)}
              sx={{ backgroundColor: COLORS.bg.primary, color: COLORS.text.primary, fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle } }}
            >
              {ALERT_METRICS.map((m) => (
                <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 90 }}>
            <Select
              value={alert.operator}
              onChange={(e) => handleUpdateAlert(alert.id, 'operator', e.target.value)}
              sx={{ backgroundColor: COLORS.bg.primary, color: COLORS.text.primary, fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle } }}
            >
              <MenuItem value="below">Below</MenuItem>
              <MenuItem value="above">Above</MenuItem>
            </Select>
          </FormControl>

          <TronTextField
            placeholder="Threshold"
            type="number"
            value={alert.threshold}
            onChange={(e) => handleUpdateAlert(alert.id, 'threshold', e.target.value)}
            sx={{ width: 100 }}
          />

          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            for
          </Typography>

          <TronTextField
            type="number"
            value={alert.duration_days}
            onChange={(e) => handleUpdateAlert(alert.id, 'duration_days', parseInt(e.target.value) || 1)}
            sx={{ width: 60 }}
          />

          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            days
          </Typography>

          <IconButton
            onClick={() => handleRemoveAlert(alert.id)}
            sx={{ color: COLORS.neon.red }}
            size="small"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Button
        onClick={handleAddAlert}
        startIcon={<AddIcon />}
        size="small"
        sx={{ color: COLORS.neon.purple, fontSize: '0.8rem', textTransform: 'none', mb: 3 }}
      >
        Add Alert
      </Button>

      {/* Closer Watches */}
      <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 600, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Closer Watches
      </Typography>

      <Box sx={reportCardStyle(local.daily_enabled)} mb={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: (local.daily_enabled ?? true) ? 1.5 : 0 }}>
          <Box>
            <Typography sx={{ color: COLORS.text.primary, fontSize: '0.9rem', fontWeight: 600 }}>
              Daily Closer Watch Email
            </Typography>
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
              Daily performance email for closers on active watch (onboarding / PIP)
            </Typography>
          </Box>
          <Switch
            checked={local.daily_enabled ?? true}
            onChange={(e) => setLocal((p) => ({ ...p, daily_enabled: e.target.checked }))}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.neon.purple }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.neon.purple } }}
          />
        </Box>
        {(local.daily_enabled ?? true) && (
          <TronTextField
            fullWidth
            placeholder="Recipients (comma-separated) — blank = primary contact"
            value={local.daily_recipients || ''}
            onChange={(e) => setLocal((p) => ({ ...p, daily_recipients: e.target.value }))}
          />
        )}
      </Box>
      {(local.close_watches || []).map((watch) => (
        <Box
          key={watch.id}
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            mb: 1,
            p: 1.5,
            backgroundColor: COLORS.bg.tertiary,
            borderRadius: 1.5,
          }}
        >
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={watch.closer_id}
              onChange={(e) => handleUpdateWatch(watch.id, 'closer_id', e.target.value)}
              sx={{ backgroundColor: COLORS.bg.primary, color: COLORS.text.primary, fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle } }}
            >
              {closers.map((c) => (
                <MenuItem key={c.closer_id} value={c.closer_id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            Watch for
          </Typography>

          <TronTextField
            type="number"
            value={watch.duration_value}
            onChange={(e) => handleUpdateWatch(watch.id, 'duration_value', parseInt(e.target.value) || 7)}
            sx={{ width: 60 }}
          />

          <FormControl size="small" sx={{ minWidth: 80 }}>
            <Select
              value={watch.duration_type}
              onChange={(e) => handleUpdateWatch(watch.id, 'duration_type', e.target.value)}
              sx={{ backgroundColor: COLORS.bg.primary, color: COLORS.text.primary, fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle } }}
            >
              <MenuItem value="days">Days</MenuItem>
              <MenuItem value="calls">Calls</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={watch.watch_type || 'onboarding'}
              onChange={(e) => handleUpdateWatch(watch.id, 'watch_type', e.target.value)}
              sx={{ backgroundColor: COLORS.bg.primary, color: COLORS.text.primary, fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle } }}
            >
              <MenuItem value="onboarding">Onboarding</MenuItem>
              <MenuItem value="pip">PIP</MenuItem>
            </Select>
          </FormControl>

          <IconButton
            onClick={() => handleRemoveWatch(watch.id)}
            sx={{ color: COLORS.neon.red }}
            size="small"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Button
        onClick={handleAddWatch}
        startIcon={<AddIcon />}
        size="small"
        sx={{ color: COLORS.neon.purple, fontSize: '0.8rem', textTransform: 'none', mb: 3 }}
      >
        Add Closer Watch
      </Button>

      {/* FTC Violation Alerts */}
      <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 600, mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        FTC Violation Alerts
      </Typography>
      <Box sx={{ p: 2, borderRadius: 2, backgroundColor: `${COLORS.neon.red}08`, border: `1px solid ${COLORS.neon.red}30`, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box>
            <Typography sx={{ color: COLORS.text.primary, fontSize: '0.9rem', fontWeight: 600 }}>
              Immediate FTC Alerts
            </Typography>
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
              Send an email the moment AI detects a high-severity compliance violation
            </Typography>
          </Box>
          <Switch
            checked={local.ftc_alerts_enabled ?? true}
            onChange={(e) => setLocal((p) => ({ ...p, ftc_alerts_enabled: e.target.checked }))}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.neon.red }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.neon.red } }}
          />
        </Box>
        {(local.ftc_alerts_enabled ?? true) && (
          <TronTextField
            fullWidth
            placeholder="e.g. tyler@company.com, compliance@company.com"
            value={local.ftc_alert_recipients || ''}
            onChange={(e) => setLocal((p) => ({ ...p, ftc_alert_recipients: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { '&.Mui-focused fieldset': { borderColor: COLORS.neon.red } } }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </Box>
    </Box>
  );
}

// ── 5. AI Prompts ────────────────────────────────────────────

function AiPromptsSection({ client, onSave }) {
  const [local, setLocal] = useState({
    ai_prompt_overall: client?.ai_prompt_overall || '',
    ai_prompt_discovery: client?.ai_prompt_discovery || '',
    ai_prompt_pitch: client?.ai_prompt_pitch || '',
    ai_prompt_close: client?.ai_prompt_close || '',
    ai_prompt_objections: client?.ai_prompt_objections || '',
    ai_context_notes: client?.ai_context_notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (client) {
      setLocal({
        ai_prompt_overall: client.ai_prompt_overall || '',
        ai_prompt_discovery: client.ai_prompt_discovery || '',
        ai_prompt_pitch: client.ai_prompt_pitch || '',
        ai_prompt_close: client.ai_prompt_close || '',
        ai_prompt_objections: client.ai_prompt_objections || '',
        ai_context_notes: client.ai_context_notes || '',
      });
    }
  }, [client]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`Failed to save AI prompts: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'ai_prompt_overall', label: 'Overall AI Prompt', rows: 4 },
    { key: 'ai_prompt_discovery', label: 'Discovery Prompt', rows: 3 },
    { key: 'ai_prompt_pitch', label: 'Pitch Prompt', rows: 3 },
    { key: 'ai_prompt_close', label: 'Close Prompt', rows: 3 },
    { key: 'ai_prompt_objections', label: 'Objections Prompt', rows: 3 },
    { key: 'ai_context_notes', label: 'AI Context Notes', rows: 4 },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        {fields.map((f) => (
          <TronTextField
            key={f.key}
            label={f.label}
            value={local[f.key]}
            onChange={(e) => setLocal((p) => ({ ...p, [f.key]: e.target.value }))}
            multiline
            rows={f.rows}
            fullWidth
          />
        ))}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </Box>
    </Box>
  );
}

// ── 6. Script ────────────────────────────────────────────────

function ScriptSection({ client, onSave }) {
  const [script, setScript] = useState(client?.script_template || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (client) setScript(client.script_template || '');
  }, [client]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ script_template: script });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`Failed to save script: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <TronTextField
        label="Script Template"
        value={script}
        onChange={(e) => setScript(e.target.value)}
        multiline
        rows={12}
        fullWidth
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </Box>
    </Box>
  );
}
