/**
 * ADMIN API CONSOLE — Run Backend admin CRUD endpoints from the admin panel.
 *
 * Three tabs:
 *   1. Clients — View/edit client details, create new clients, add filter words
 *   2. Closers — List (with inactive toggle), add, edit, deactivate, reactivate, register Fathom
 *   3. System — Backend health check
 *
 * All requests proxy through /api/backend/* → Backend API.
 * Response panel at the bottom shows the last request/response.
 *
 * Route: /admin/api-console
 * Auth: Admin API key (from sessionStorage)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LogoutIcon from '@mui/icons-material/Logout';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreIcon from '@mui/icons-material/Restore';
import { COLORS, LAYOUT } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../../utils/api';
import TierBadge from '../../components/layout/TierBadge';

// ── Shared Styles ──────────────────────────────────────────────

const cardSx = {
  p: 3,
  borderRadius: `${LAYOUT.cardBorderRadius}px`,
  border: `1px solid ${COLORS.border.subtle}`,
  backgroundColor: COLORS.bg.secondary,
  mb: 3,
};

const sectionHeaderSx = {
  color: COLORS.text.primary,
  mb: 1.5,
  fontSize: '0.95rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    '&.Mui-focused fieldset': {
      borderColor: COLORS.neon.cyan,
      boxShadow: `0 0 8px ${COLORS.neon.cyan}40`,
    },
  },
};

const fieldLabelSx = {
  color: COLORS.text.muted,
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  mb: 0.3,
};

const fieldValueSx = {
  color: COLORS.text.primary,
  fontSize: '0.85rem',
  wordBreak: 'break-word',
};

// ── Field Definitions ─────────────────────────────────────────

const CLIENT_FIELDS = [
  // Basic Info
  { key: 'company_name', label: 'Company Name', required: true, group: 'Basic' },
  { key: 'name', label: 'Name', group: 'Basic' },
  { key: 'primary_contact_email', label: 'Contact Email', required: true, group: 'Basic' },
  { key: 'primary_contact_phone', label: 'Contact Phone', group: 'Basic' },
  { key: 'timezone', label: 'Timezone', required: true, group: 'Basic' },
  { key: 'plan_tier', label: 'Plan Tier', type: 'tier', group: 'Basic' },
  { key: 'status', label: 'Status', group: 'Basic' },
  // Offer
  { key: 'offer_name', label: 'Offer Name', required: true, group: 'Offer' },
  { key: 'offer_price', label: 'Offer Price', type: 'number', required: true, group: 'Offer' },
  { key: 'offer_description', label: 'Offer Description', multiline: true, group: 'Offer' },
  // Config
  { key: 'filter_word', label: 'Filter Words', required: true, group: 'Config' },
  { key: 'calendar_source', label: 'Calendar Source', group: 'Config' },
  { key: 'transcript_provider', label: 'Transcript Provider', group: 'Config' },
  // AI Prompts
  { key: 'ai_prompt_overall', label: 'AI Prompt — Overall', multiline: true, group: 'AI' },
  { key: 'ai_prompt_discovery', label: 'AI Prompt — Discovery', multiline: true, group: 'AI' },
  { key: 'ai_prompt_pitch', label: 'AI Prompt — Pitch', multiline: true, group: 'AI' },
  { key: 'ai_prompt_close', label: 'AI Prompt — Close', multiline: true, group: 'AI' },
  { key: 'ai_prompt_objections', label: 'AI Prompt — Objections', multiline: true, group: 'AI' },
  // Sales Context
  { key: 'script_template', label: 'Script Template', multiline: true, group: 'Sales' },
  { key: 'common_objections', label: 'Common Objections', multiline: true, group: 'Sales' },
  { key: 'disqualification_criteria', label: 'Disqualification Criteria', multiline: true, group: 'Sales' },
];

const CLIENT_READONLY_FIELDS = [
  { key: 'client_id', label: 'Client ID' },
  { key: 'webhook_secret', label: 'Webhook Secret' },
  { key: 'created_at', label: 'Created' },
  { key: 'last_modified', label: 'Last Modified' },
];

const CLOSER_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'work_email', label: 'Work Email', required: true },
  { key: 'personal_email', label: 'Personal Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'transcript_provider', label: 'Transcript Provider' },
  { key: 'transcript_api_key', label: 'Transcript API Key' },
];

// ── Main Component ─────────────────────────────────────────────

export default function AdminApiConsole() {
  const navigate = useNavigate();
  const { mode, isAuthenticated, checkAdminSession, logout } = useAuth();

  // Tab state
  const [tab, setTab] = useState(0);

  // Shared client selector state (used by both Clients and Closers tabs)
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  // Response panel state
  const [lastRequest, setLastRequest] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [lastResponseOk, setLastResponseOk] = useState(true);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Check admin session on mount
  useEffect(() => {
    if (!isAuthenticated) {
      const hasSession = checkAdminSession();
      if (!hasSession) {
        navigate('/admin/login');
      }
    }
  }, [isAuthenticated, checkAdminSession, navigate]);

  // Fetch client list on mount
  const fetchClients = useCallback(async () => {
    try {
      setLoadingClients(true);
      const res = await apiGet('/admin/clients');
      setClients(res.data || []);
    } catch (err) {
      setSnackbar({ open: true, message: `Failed to load clients: ${err.message}`, severity: 'error' });
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'admin' && isAuthenticated) {
      fetchClients();
    }
  }, [mode, isAuthenticated, fetchClients]);

  /**
   * Wrapper to execute a Backend proxy call and capture the response for the panel.
   */
  const executeRequest = async (method, path, body) => {
    setLastRequest(`${method} ${path}`);
    setLastResponse(null);

    try {
      let res;
      switch (method) {
        case 'GET':
          res = await apiGet(path);
          break;
        case 'POST':
          res = await apiPost(path, body);
          break;
        case 'PUT':
          res = await apiPut(path, body);
          break;
        case 'PATCH':
          res = await apiPatch(path, body);
          break;
        case 'DELETE':
          res = await apiDelete(path);
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }
      setLastResponse(res);
      setLastResponseOk(true);
      setSnackbar({ open: true, message: 'Request succeeded', severity: 'success' });
      return res;
    } catch (err) {
      const errorResponse = { error: err.message };
      setLastResponse(errorResponse);
      setLastResponseOk(false);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
      throw err;
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  // Auth loading guard
  if (!isAuthenticated && mode !== 'admin') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg.primary }}>
        <CircularProgress sx={{ color: COLORS.neon.cyan }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: COLORS.bg.primary }}>
      {/* ── Top Bar ── */}
      <Box
        sx={{
          height: LAYOUT.topBarHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          borderBottom: `1px solid ${COLORS.border.subtle}`,
          backgroundColor: COLORS.bg.secondary,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/admin')}
            sx={{ color: COLORS.text.secondary, textTransform: 'none', '&:hover': { color: COLORS.neon.cyan } }}
          >
            Admin
          </Button>
          <Typography sx={{ color: COLORS.text.muted }}>|</Typography>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: COLORS.neon.cyan, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.95rem' }}
          >
            API Console
          </Typography>
        </Box>
        <IconButton
          onClick={handleLogout}
          sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.red } }}
        >
          <LogoutIcon />
        </IconButton>
      </Box>

      {/* ── Content ── */}
      <Box sx={{ p: 3, maxWidth: LAYOUT.contentMaxWidth, mx: 'auto' }}>
        {/* ── Tabs ── */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            mb: 3,
            '& .MuiTab-root': { color: COLORS.text.secondary, textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: COLORS.neon.cyan },
            '& .MuiTabs-indicator': { backgroundColor: COLORS.neon.cyan },
          }}
        >
          <Tab label="Clients" />
          <Tab label="Closers" />
          <Tab label="System" />
        </Tabs>

        {/* ── Client Selector (shared between Clients & Closers tabs) ── */}
        {tab < 2 && (
          <Box sx={cardSx}>
            <Typography sx={sectionHeaderSx}>Select Client</Typography>
            <FormControl size="small" sx={{ minWidth: 300 }}>
              <InputLabel sx={{ color: COLORS.text.secondary }}>Client</InputLabel>
              <Select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                label="Client"
                disabled={loadingClients}
              >
                <MenuItem value="">
                  <em>None — Create New Client</em>
                </MenuItem>
                {clients.map((c) => (
                  <MenuItem key={c.client_id} value={c.client_id}>
                    {c.company_name} ({c.client_id.slice(0, 8)}...)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {loadingClients && <CircularProgress size={20} sx={{ ml: 2, color: COLORS.neon.cyan }} />}
          </Box>
        )}

        {/* ── Tab Content ── */}
        {tab === 0 && (
          <ClientsTab
            selectedClientId={selectedClientId}
            executeRequest={executeRequest}
            onClientCreated={fetchClients}
          />
        )}
        {tab === 1 && (
          <ClosersTab
            selectedClientId={selectedClientId}
            executeRequest={executeRequest}
          />
        )}
        {tab === 2 && (
          <SystemTab executeRequest={executeRequest} />
        )}

        {/* ── Response Panel ── */}
        <Box sx={{ mt: 4 }}>
          <Typography sx={sectionHeaderSx}>Response</Typography>
          <Box
            sx={{
              ...cardSx,
              mb: 0,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            {lastRequest ? (
              <>
                <Typography
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: COLORS.text.muted,
                    mb: 1,
                  }}
                >
                  {lastRequest}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: lastResponseOk ? COLORS.neon.cyan : COLORS.neon.red,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    m: 0,
                    p: 0,
                  }}
                >
                  {lastResponse ? JSON.stringify(lastResponse, null, 2) : 'Loading...'}
                </Box>
              </>
            ) : (
              <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
                No requests yet. Use the forms above to send a request.
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Snackbar ── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ backgroundColor: COLORS.bg.elevated, color: COLORS.text.primary }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ── Clients Tab ────────────────────────────────────────────────
//
// No client selected → Create Client form
// Client selected → View mode (read-only) → Edit button → Edit mode → Save/Cancel
//

function ClientsTab({ selectedClientId, executeRequest, onClientCreated }) {
  // View mode: 'create' | 'view' | 'edit'
  const [viewMode, setViewMode] = useState(selectedClientId ? 'view' : 'create');

  // Full client detail from Backend
  const [clientDetail, setClientDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({
    company_name: '', primary_contact_email: '', offer_name: '', offer_price: '',
    filter_word: '', plan_tier: 'basic', timezone: 'America/New_York',
    name: '', primary_contact_phone: '', offer_description: '',
    calendar_source: '', transcript_provider: '',
  });
  const [creating, setCreating] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Filter words
  const [filterWords, setFilterWords] = useState('');
  const [addingWords, setAddingWords] = useState(false);

  // Fetch full client details from Backend (silent — doesn't update response panel)
  const fetchClientDetail = useCallback(async (clientId) => {
    if (!clientId) return;
    setLoadingDetail(true);
    try {
      const res = await apiGet(`/backend/clients/${clientId}`);
      setClientDetail(res);
    } catch {
      setClientDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // When selectedClientId changes, fetch detail and switch mode
  useEffect(() => {
    if (selectedClientId) {
      fetchClientDetail(selectedClientId);
      setViewMode('view');
    } else {
      setViewMode('create');
      setClientDetail(null);
    }
  }, [selectedClientId, fetchClientDetail]);

  // Enter edit mode — populate editForm from clientDetail
  const handleStartEdit = () => {
    if (!clientDetail) return;
    const form = {};
    CLIENT_FIELDS.forEach((f) => {
      form[f.key] = clientDetail[f.key] ?? '';
    });
    setEditForm(form);
    setViewMode('edit');
  };

  // Save edit
  const handleSave = async () => {
    if (!selectedClientId) return;
    setSaving(true);
    try {
      // Build updates — only send non-empty changed fields
      const updates = {};
      CLIENT_FIELDS.forEach((f) => {
        const val = editForm[f.key];
        if (val !== undefined && val !== '') {
          updates[f.key] = f.type === 'number' ? Number(val) : val;
        }
      });
      await executeRequest('PUT', `/backend/clients/${selectedClientId}`, updates);
      await fetchClientDetail(selectedClientId);
      setViewMode('view');
      onClientCreated();
    } catch {
      // Error handled by executeRequest
    } finally {
      setSaving(false);
    }
  };

  // Create client
  const handleCreate = async () => {
    setCreating(true);
    try {
      await executeRequest('POST', '/backend/clients', {
        ...createForm,
        offer_price: createForm.offer_price ? Number(createForm.offer_price) : undefined,
      });
      setCreateForm({
        company_name: '', primary_contact_email: '', offer_name: '', offer_price: '',
        filter_word: '', plan_tier: 'basic', timezone: 'America/New_York',
        name: '', primary_contact_phone: '', offer_description: '',
        calendar_source: '', transcript_provider: '',
      });
      onClientCreated();
    } catch {
      // Error handled
    } finally {
      setCreating(false);
    }
  };

  // Add filter words
  const handleAddFilterWords = async () => {
    if (!selectedClientId || !filterWords.trim()) return;
    setAddingWords(true);
    try {
      const wordsArray = filterWords.split(',').map((w) => w.trim()).filter(Boolean);
      await executeRequest('PATCH', `/backend/clients/${selectedClientId}/filter-words`, {
        words: wordsArray,
      });
      setFilterWords('');
      await fetchClientDetail(selectedClientId);
    } catch {
      // Error handled
    } finally {
      setAddingWords(false);
    }
  };

  const updateCreateField = (field) => (e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }));
  const updateEditField = (field) => (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));

  // ── CREATE MODE ──
  if (viewMode === 'create') {
    return (
      <Box sx={cardSx}>
        <Typography sx={sectionHeaderSx}>Create Client</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField size="small" label="Company Name *" value={createForm.company_name} onChange={updateCreateField('company_name')} sx={{ minWidth: 200, ...inputSx }} />
          <TextField size="small" label="Contact Email *" value={createForm.primary_contact_email} onChange={updateCreateField('primary_contact_email')} sx={{ minWidth: 220, ...inputSx }} />
          <TextField size="small" label="Offer Name *" value={createForm.offer_name} onChange={updateCreateField('offer_name')} sx={{ minWidth: 180, ...inputSx }} />
          <TextField size="small" label="Offer Price *" type="number" value={createForm.offer_price} onChange={updateCreateField('offer_price')} sx={{ minWidth: 120, ...inputSx }} />
          <TextField size="small" label="Filter Word *" value={createForm.filter_word} onChange={updateCreateField('filter_word')} sx={{ minWidth: 140, ...inputSx }} />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel sx={{ color: COLORS.text.secondary }}>Tier *</InputLabel>
            <Select value={createForm.plan_tier} onChange={updateCreateField('plan_tier')} label="Tier *">
              <MenuItem value="basic">Basic</MenuItem>
              <MenuItem value="insight">Insight</MenuItem>
              <MenuItem value="executive">Executive</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Timezone *" value={createForm.timezone} onChange={updateCreateField('timezone')} sx={{ minWidth: 180, ...inputSx }} />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField size="small" label="Name" value={createForm.name} onChange={updateCreateField('name')} sx={{ minWidth: 160, ...inputSx }} />
          <TextField size="small" label="Phone" value={createForm.primary_contact_phone} onChange={updateCreateField('primary_contact_phone')} sx={{ minWidth: 140, ...inputSx }} />
          <TextField size="small" label="Offer Description" value={createForm.offer_description} onChange={updateCreateField('offer_description')} sx={{ minWidth: 200, flexGrow: 1, ...inputSx }} />
          <TextField size="small" label="Calendar Source" value={createForm.calendar_source} onChange={updateCreateField('calendar_source')} sx={{ minWidth: 160, ...inputSx }} />
          <TextField size="small" label="Transcript Provider" value={createForm.transcript_provider} onChange={updateCreateField('transcript_provider')} sx={{ minWidth: 160, ...inputSx }} />
        </Box>
        <Button
          variant="contained"
          startIcon={creating ? <CircularProgress size={16} /> : <SendIcon />}
          onClick={handleCreate}
          disabled={creating || !createForm.company_name || !createForm.primary_contact_email || !createForm.offer_name || !createForm.filter_word}
          sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
        >
          Create Client
        </Button>
      </Box>
    );
  }

  // ── LOADING ──
  if (loadingDetail) {
    return (
      <Box sx={{ ...cardSx, display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} sx={{ color: COLORS.neon.cyan }} />
      </Box>
    );
  }

  if (!clientDetail) {
    return (
      <Box sx={cardSx}>
        <Typography sx={{ color: COLORS.text.muted }}>Failed to load client details.</Typography>
      </Box>
    );
  }

  // ── VIEW / EDIT MODE ──
  const isEditing = viewMode === 'edit';

  // Group fields by their group
  const groups = ['Basic', 'Offer', 'Config', 'AI', 'Sales'];
  const groupLabels = { Basic: 'Basic Info', Offer: 'Offer Details', Config: 'Configuration', AI: 'AI Prompts', Sales: 'Sales Context' };

  return (
    <>
      {/* ── Client Detail Card ── */}
      <Box sx={cardSx}>
        {/* Header with edit/save/cancel */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={sectionHeaderSx} style={{ marginBottom: 0 }}>
              {isEditing ? 'Edit Client' : 'Client Details'}
            </Typography>
            <TierBadge tier={clientDetail.plan_tier} />
          </Box>
          {isEditing ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<CloseIcon />}
                onClick={() => setViewMode('view')}
                sx={{ color: COLORS.text.secondary, textTransform: 'none' }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                Save
              </Button>
            </Box>
          ) : (
            <Button
              size="small"
              startIcon={<EditIcon />}
              onClick={handleStartEdit}
              sx={{ color: COLORS.neon.cyan, textTransform: 'none', fontWeight: 600 }}
            >
              Edit
            </Button>
          )}
        </Box>

        {/* Read-only system fields */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 3, pb: 2, borderBottom: `1px solid ${COLORS.border.subtle}` }}>
          {CLIENT_READONLY_FIELDS.map((f) => (
            <Box key={f.key} sx={{ minWidth: 150 }}>
              <Typography sx={fieldLabelSx}>{f.label}</Typography>
              <Typography sx={{ ...fieldValueSx, fontSize: '0.75rem', color: COLORS.text.muted, fontFamily: 'monospace' }}>
                {clientDetail[f.key] || '—'}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Editable fields by group */}
        {groups.map((group) => {
          const fields = CLIENT_FIELDS.filter((f) => f.group === group);
          if (fields.length === 0) return null;

          return (
            <Box key={group} sx={{ mb: 3 }}>
              <Typography sx={{ color: COLORS.text.muted, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1.5 }}>
                {groupLabels[group]}
              </Typography>

              {isEditing ? (
                // ── EDIT MODE: inputs ──
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {fields.map((f) => {
                    if (f.type === 'tier') {
                      return (
                        <FormControl key={f.key} size="small" sx={{ minWidth: 130 }}>
                          <InputLabel sx={{ color: COLORS.text.secondary }}>{f.label}</InputLabel>
                          <Select value={editForm[f.key] || 'basic'} onChange={updateEditField(f.key)} label={f.label}>
                            <MenuItem value="basic">Basic</MenuItem>
                            <MenuItem value="insight">Insight</MenuItem>
                            <MenuItem value="executive">Executive</MenuItem>
                          </Select>
                        </FormControl>
                      );
                    }
                    return (
                      <TextField
                        key={f.key}
                        size="small"
                        label={f.label}
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={editForm[f.key] ?? ''}
                        onChange={updateEditField(f.key)}
                        multiline={f.multiline}
                        minRows={f.multiline ? 2 : undefined}
                        maxRows={f.multiline ? 6 : undefined}
                        sx={{ minWidth: f.multiline ? '100%' : 180, flexGrow: f.multiline ? 1 : 0, ...inputSx }}
                      />
                    );
                  })}
                </Box>
              ) : (
                // ── VIEW MODE: read-only ──
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {fields.map((f) => {
                    const val = clientDetail[f.key];
                    const isEmpty = val === null || val === undefined || val === '';
                    return (
                      <Box key={f.key} sx={{ minWidth: f.multiline ? '100%' : 160, maxWidth: f.multiline ? '100%' : 280 }}>
                        <Typography sx={fieldLabelSx}>{f.label}</Typography>
                        {f.multiline && !isEmpty ? (
                          <Box
                            sx={{
                              p: 1.5,
                              borderRadius: 1,
                              backgroundColor: COLORS.bg.primary,
                              border: `1px solid ${COLORS.border.subtle}`,
                              maxHeight: 120,
                              overflow: 'auto',
                            }}
                          >
                            <Typography sx={{ ...fieldValueSx, fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                              {val}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ ...fieldValueSx, color: isEmpty ? COLORS.text.muted : COLORS.text.primary }}>
                            {isEmpty ? '—' : String(val)}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* ── Add Filter Words ── */}
      <Box sx={cardSx}>
        <Typography sx={sectionHeaderSx}>Add Filter Words</Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem', mb: 1.5 }}>
          Current: <span style={{ color: COLORS.text.primary }}>{clientDetail.filter_word || 'None'}</span>
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          <TextField
            size="small"
            label="Comma-separated words to add"
            value={filterWords}
            onChange={(e) => setFilterWords(e.target.value)}
            placeholder="e.g. coaching, mentorship, program"
            sx={{ minWidth: 300, flexGrow: 1, ...inputSx }}
          />
          <Button
            variant="contained"
            startIcon={addingWords ? <CircularProgress size={16} /> : <SendIcon />}
            onClick={handleAddFilterWords}
            disabled={addingWords || !filterWords.trim()}
            sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
          >
            Add Words
          </Button>
        </Box>
      </Box>
    </>
  );
}

// ── Closers Tab ────────────────────────────────────────────────
//
// Features:
//   - Closer list with inactive toggle
//   - Add closer form
//   - Edit closer (inline form below list)
//   - Deactivate (for active closers)
//   - Reactivate (for inactive closers)
//   - Register Fathom webhook
//

function ClosersTab({ selectedClientId, executeRequest }) {
  // Closer list
  const [closers, setClosers] = useState([]);
  const [loadingClosers, setLoadingClosers] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Add closer form
  const [addForm, setAddForm] = useState({
    name: '', work_email: '', personal_email: '', phone: '',
    timezone: '', transcript_provider: '', transcript_api_key: '',
  });
  const [adding, setAdding] = useState(false);

  // Edit closer state
  const [editingCloserId, setEditingCloserId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Register Fathom
  const [fathomCloserId, setFathomCloserId] = useState('');
  const [fathomApiKey, setFathomApiKey] = useState('');
  const [registeringFathom, setRegisteringFathom] = useState(false);

  // Fetch closers (silent — not through executeRequest)
  const fetchClosers = useCallback(async () => {
    if (!selectedClientId) {
      setClosers([]);
      return;
    }
    setLoadingClosers(true);
    try {
      const params = includeInactive ? { includeInactive: 'true' } : {};
      const res = await apiGet(`/backend/clients/${selectedClientId}/closers`, params);
      setClosers(res?.closers || []);
    } catch {
      setClosers([]);
    } finally {
      setLoadingClosers(false);
    }
  }, [selectedClientId, includeInactive]);

  useEffect(() => {
    fetchClosers();
  }, [fetchClosers]);

  // Add closer
  const handleAddCloser = async () => {
    if (!selectedClientId) return;
    setAdding(true);
    try {
      const body = { name: addForm.name, work_email: addForm.work_email };
      if (addForm.personal_email) body.personal_email = addForm.personal_email;
      if (addForm.phone) body.phone = addForm.phone;
      if (addForm.timezone) body.timezone = addForm.timezone;
      if (addForm.transcript_provider) body.transcript_provider = addForm.transcript_provider;
      if (addForm.transcript_api_key) body.transcript_api_key = addForm.transcript_api_key;

      await executeRequest('POST', `/backend/clients/${selectedClientId}/closers`, body);
      setAddForm({ name: '', work_email: '', personal_email: '', phone: '', timezone: '', transcript_provider: '', transcript_api_key: '' });
      fetchClosers();
    } catch {
      // Error handled
    } finally {
      setAdding(false);
    }
  };

  // Start editing a closer
  const handleStartEdit = (closer) => {
    const form = {};
    CLOSER_FIELDS.forEach((f) => {
      form[f.key] = closer[f.key] ?? '';
    });
    setEditForm(form);
    setEditingCloserId(closer.closer_id);
  };

  // Save closer edit
  const handleSaveEdit = async () => {
    if (!selectedClientId || !editingCloserId) return;
    setSavingEdit(true);
    try {
      // Build updates — only non-empty fields
      const updates = {};
      CLOSER_FIELDS.forEach((f) => {
        const val = editForm[f.key];
        if (val !== undefined && val !== '') {
          updates[f.key] = val;
        }
      });
      await executeRequest('PUT', `/backend/clients/${selectedClientId}/closers/${editingCloserId}`, updates);
      setEditingCloserId(null);
      fetchClosers();
    } catch {
      // Error handled
    } finally {
      setSavingEdit(false);
    }
  };

  // Deactivate closer
  const handleDeactivate = async (closer) => {
    const confirmed = window.confirm(`Deactivate "${closer.name}"?\n\nThis will set the closer to inactive. Historical data is preserved.`);
    if (!confirmed) return;
    try {
      await executeRequest('DELETE', `/backend/clients/${selectedClientId}/closers/${closer.closer_id}`);
      fetchClosers();
    } catch {
      // Error handled
    }
  };

  // Reactivate closer
  const handleReactivate = async (closer) => {
    try {
      await executeRequest('PATCH', `/backend/clients/${selectedClientId}/closers/${closer.closer_id}/reactivate`);
      fetchClosers();
    } catch {
      // Error handled
    }
  };

  // Register Fathom
  const handleRegisterFathom = async () => {
    if (!selectedClientId || !fathomCloserId || !fathomApiKey) return;
    setRegisteringFathom(true);
    try {
      await executeRequest('POST', `/backend/clients/${selectedClientId}/closers/${fathomCloserId}/register-fathom`, {
        transcript_api_key: fathomApiKey,
      });
      setFathomApiKey('');
    } catch {
      // Error handled
    } finally {
      setRegisteringFathom(false);
    }
  };

  const updateAddField = (field) => (e) => setAddForm((f) => ({ ...f, [field]: e.target.value }));
  const updateEditField = (field) => (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));

  if (!selectedClientId) {
    return (
      <Box sx={cardSx}>
        <Typography sx={{ color: COLORS.text.muted }}>Select a client above to manage closers.</Typography>
      </Box>
    );
  }

  return (
    <>
      {/* ── Closer List ── */}
      <Box sx={cardSx}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={sectionHeaderSx} style={{ marginBottom: 0 }}>Closers</Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.neon.cyan },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.neon.cyan },
                }}
              />
            }
            label={<Typography sx={{ fontSize: '0.8rem', color: COLORS.text.secondary }}>Include Inactive</Typography>}
          />
        </Box>

        {loadingClosers ? (
          <CircularProgress size={24} sx={{ color: COLORS.neon.cyan }} />
        ) : closers.length === 0 ? (
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>No closers found.</Typography>
        ) : (
          <Box
            sx={{
              borderRadius: `${LAYOUT.cardBorderRadius}px`,
              border: `1px solid ${COLORS.border.subtle}`,
              backgroundColor: COLORS.bg.primary,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 2fr 80px 120px',
                gap: 2,
                px: 2,
                py: 1,
                borderBottom: `1px solid ${COLORS.border.subtle}`,
                backgroundColor: COLORS.bg.tertiary,
              }}
            >
              {['Name', 'Email', 'Status', 'Actions'].map((h) => (
                <Typography
                  key={h}
                  variant="caption"
                  sx={{ color: COLORS.text.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.6rem' }}
                >
                  {h}
                </Typography>
              ))}
            </Box>
            {/* Rows */}
            {closers.map((closer) => {
              const isActive = closer.status === 'active' || closer.status === 'Active';
              return (
                <Box
                  key={closer.closer_id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 2fr 80px 120px',
                    gap: 2,
                    px: 2,
                    py: 1,
                    alignItems: 'center',
                    borderBottom: `1px solid ${COLORS.border.subtle}`,
                    '&:last-child': { borderBottom: 'none' },
                    '&:hover': { backgroundColor: COLORS.bg.elevated },
                    transition: 'background-color 0.15s ease',
                    opacity: isActive ? 1 : 0.5,
                  }}
                >
                  <Typography sx={{ color: COLORS.text.primary, fontSize: '0.85rem' }}>{closer.name}</Typography>
                  <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem' }}>{closer.work_email || '—'}</Typography>
                  <Typography
                    sx={{
                      color: isActive ? COLORS.neon.green : COLORS.text.muted,
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    }}
                  >
                    {closer.status || 'active'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => handleStartEdit(closer)} sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.cyan } }}>
                        <EditIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Tooltip>
                    {isActive ? (
                      <Tooltip title="Deactivate">
                        <IconButton size="small" onClick={() => handleDeactivate(closer)} sx={{ color: COLORS.text.muted, '&:hover': { color: COLORS.neon.red } }}>
                          <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Reactivate">
                        <IconButton size="small" onClick={() => handleReactivate(closer)} sx={{ color: COLORS.text.muted, '&:hover': { color: COLORS.neon.green } }}>
                          <RestoreIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* ── Edit Closer Form (shown when editing) ── */}
      {editingCloserId && (
        <Box sx={cardSx}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={sectionHeaderSx} style={{ marginBottom: 0 }}>
              Edit Closer — {editForm.name || editingCloserId}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<CloseIcon />}
                onClick={() => setEditingCloserId(null)}
                sx={{ color: COLORS.text.secondary, textTransform: 'none' }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={savingEdit ? <CircularProgress size={14} /> : <SaveIcon />}
                onClick={handleSaveEdit}
                disabled={savingEdit}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                Save
              </Button>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {CLOSER_FIELDS.map((f) => (
              <TextField
                key={f.key}
                size="small"
                label={f.label}
                value={editForm[f.key] ?? ''}
                onChange={updateEditField(f.key)}
                sx={{ minWidth: 180, ...inputSx }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── Add Closer ── */}
      <Box sx={cardSx}>
        <Typography sx={sectionHeaderSx}>Add Closer</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField size="small" label="Name *" value={addForm.name} onChange={updateAddField('name')} sx={{ minWidth: 160, ...inputSx }} />
          <TextField size="small" label="Work Email *" value={addForm.work_email} onChange={updateAddField('work_email')} sx={{ minWidth: 220, ...inputSx }} />
          <TextField size="small" label="Personal Email" value={addForm.personal_email} onChange={updateAddField('personal_email')} sx={{ minWidth: 200, ...inputSx }} />
          <TextField size="small" label="Phone" value={addForm.phone} onChange={updateAddField('phone')} sx={{ minWidth: 140, ...inputSx }} />
          <TextField size="small" label="Timezone" value={addForm.timezone} onChange={updateAddField('timezone')} sx={{ minWidth: 160, ...inputSx }} />
          <TextField size="small" label="Transcript Provider" value={addForm.transcript_provider} onChange={updateAddField('transcript_provider')} sx={{ minWidth: 160, ...inputSx }} />
          <TextField size="small" label="Transcript API Key" value={addForm.transcript_api_key} onChange={updateAddField('transcript_api_key')} sx={{ minWidth: 200, ...inputSx }} />
        </Box>
        <Button
          variant="contained"
          startIcon={adding ? <CircularProgress size={16} /> : <SendIcon />}
          onClick={handleAddCloser}
          disabled={adding || !addForm.name || !addForm.work_email}
          sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
        >
          Add Closer
        </Button>
      </Box>

      {/* ── Register Fathom ── */}
      <Box sx={cardSx}>
        <Typography sx={sectionHeaderSx}>Register Fathom Webhook</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 250 }}>
            <InputLabel sx={{ color: COLORS.text.secondary }}>Select Closer</InputLabel>
            <Select
              value={fathomCloserId}
              onChange={(e) => setFathomCloserId(e.target.value)}
              label="Select Closer"
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {closers.map((c) => (
                <MenuItem key={c.closer_id} value={c.closer_id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Transcript API Key"
            value={fathomApiKey}
            onChange={(e) => setFathomApiKey(e.target.value)}
            sx={{ minWidth: 250, flexGrow: 1, ...inputSx }}
          />
          <Button
            variant="contained"
            startIcon={registeringFathom ? <CircularProgress size={16} /> : <SendIcon />}
            onClick={handleRegisterFathom}
            disabled={registeringFathom || !fathomCloserId || !fathomApiKey}
            sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
          >
            Register
          </Button>
        </Box>
      </Box>
    </>
  );
}

// ── System Tab ─────────────────────────────────────────────────

function SystemTab({ executeRequest }) {
  const [checking, setChecking] = useState(false);

  const handleHealthCheck = async () => {
    setChecking(true);
    try {
      await executeRequest('GET', '/backend/health');
    } catch {
      // Error handled
    } finally {
      setChecking(false);
    }
  };

  return (
    <Box sx={cardSx}>
      <Typography sx={sectionHeaderSx}>Backend Health Check</Typography>
      <Typography sx={{ color: COLORS.text.secondary, mb: 2, fontSize: '0.85rem' }}>
        Ping the Backend API to verify connectivity and status.
      </Typography>
      <Button
        variant="contained"
        onClick={handleHealthCheck}
        disabled={checking}
        startIcon={checking ? <CircularProgress size={16} /> : null}
        sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
      >
        {checking ? 'Checking...' : 'Check Health'}
      </Button>
    </Box>
  );
}
