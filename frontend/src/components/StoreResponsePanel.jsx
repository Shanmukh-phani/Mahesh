import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Box, Typography, Card, Chip, Button, TextField, MenuItem, CircularProgress, Collapse } from '@mui/material';
import { MessageCircleReply, Clock, History, Send, UserRound, Hourglass } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';

const MAX_LEN = 1000;

const TEMPLATES = [
  'Customer has been informed.',
  'Customer informed and will visit tomorrow.',
  'Customer collected the medicine.',
  'Customer not reachable, will try again.',
  'Customer no longer needs the medicine.'
];

export const adminHasResponded = (request) =>
  Boolean(request) && (request.status !== 'Pending' || Boolean(request.mainBranchResponse || request.adminNotes));

const fmt = (d) => (d ? format(new Date(d), 'dd MMM yyyy, h:mm a') : '');

const HistoryList = ({ history, accent }) => {
  const [open, setOpen] = useState(false);
  const items = [...(history || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (items.length <= 1) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        size="small"
        startIcon={<History size={14} />}
        onClick={() => setOpen((v) => !v)}
        sx={{ fontWeight: 700, color: accent, textTransform: 'none', px: 1 }}
      >
        {open ? 'Hide' : 'Show'} update history ({items.length})
      </Button>
      <Collapse in={open}>
        <Box sx={{ mt: 1, pl: 1.5, borderLeft: `2px solid ${accent}33`, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {items.map((h, i) => (
            <Box key={h._id || i}>
              <Typography sx={{ fontSize: '0.84rem', color: '#0F172A', fontWeight: 600, wordBreak: 'break-word' }}>{h.message}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {h.employeeName || 'Store Staff'} · {fmt(h.createdAt)}{i === 0 ? ' · latest' : ''}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

const LatestResponse = ({ request, accent }) => (
  <Box sx={{ p: 1.75, bgcolor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
    <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
      {request.storeResponse}
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 0.5, sm: 1.5 }, mt: 1, color: '#64748B' }}>
      <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, color: accent }}>
        <UserRound size={13} /> {request.storeResponseBy || 'Store Staff'}
      </Typography>
      {request.storeResponseAt && (
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Clock size={13} /> Updated {fmt(request.storeResponseAt)}
        </Typography>
      )}
    </Box>
  </Box>
);

/**
 * Store follow-up on a request. Read-only for ADMIN; editable for MINI_STORE once the main branch has responded.
 */
const StoreResponsePanel = ({ request, role = 'ADMIN', onSaved, compact = false }) => {
  const isStore = role === 'MINI_STORE';
  const accent = '#EA580C';
  const responded = adminHasResponded(request);
  const { user } = useContext(AuthContext);
  const loggedInEmployee = user?.employee?.employeeName || '';

  const [message, setMessage] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMessage(request?.storeResponse || '');
  }, [request?._id, request?.storeResponse]);

  useEffect(() => {
    if (!isStore || !responded || loggedInEmployee) return;
    let active = true;
    api.get('/employees/my-store')
      .then((res) => { if (active) setEmployees(res.data || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [isStore, responded, loggedInEmployee]);

  if (!request) return null;

  const trimmed = message.trim();
  const unchanged = trimmed === (request.storeResponse || '').trim();

  const handleSave = async () => {
    if (!trimmed) {
      toast.error('Please enter the store response');
      return;
    }
    if (trimmed.length > MAX_LEN) {
      toast.error(`Maximum ${MAX_LEN} characters`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/requests/${request._id}/store-response`, { message: trimmed, employeeName });
      toast.success('Update sent to main branch');
      onSaved?.(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save store response');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <MessageCircleReply size={20} color={accent} />
        <Typography variant="subtitle1" fontWeight="800" color="#7C2D12" sx={{ fontSize: compact ? '0.9rem' : undefined }}>
          Store Response / Customer Update
        </Typography>
      </Box>
      {request.storeResponse ? (
        <Chip size="small" label="Store updated" sx={{ bgcolor: '#FFEDD5', color: '#9A3412', fontWeight: 800 }} />
      ) : (
        <Chip size="small" label="No update yet" sx={{ bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 700 }} />
      )}
    </Box>
  );

  return (
    <Card
      sx={{
        p: compact ? 1.75 : { xs: 2, sm: 2.5 },
        borderRadius: '16px',
        bgcolor: '#FFF7ED',
        border: '1px solid #FED7AA',
        boxShadow: 'none',
        gridColumn: { md: '1 / -1' }
      }}
    >
      {header}

      {!isStore && (
        request.storeResponse ? (
          <>
            <LatestResponse request={request} accent={accent} />
            <HistoryList history={request.storeResponseHistory} accent={accent} />
          </>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: '#9A3412', fontWeight: 600 }}>
            The store hasn't added a customer update for this request yet.
          </Typography>
        )
      )}

      {isStore && !responded && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.5, bgcolor: '#FFFFFF', borderRadius: '10px', border: '1px dashed #FDBA74' }}>
          <Hourglass size={16} color={accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ fontSize: '0.84rem', color: '#9A3412', fontWeight: 600 }}>
            Waiting for the main branch to respond. You can add a customer update after they reply.
          </Typography>
        </Box>
      )}

      {isStore && responded && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {request.storeResponse && <LatestResponse request={request} accent={accent} />}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {TEMPLATES.map((t) => (
              <Chip
                key={t}
                label={t}
                size="small"
                onClick={() => setMessage(t)}
                sx={{
                  height: 'auto', py: 0.5, borderRadius: '8px', fontWeight: 600, fontSize: '0.74rem',
                  '& .MuiChip-label': { whiteSpace: 'normal' },
                  bgcolor: message === t ? accent : '#FFFFFF',
                  color: message === t ? '#FFFFFF' : '#9A3412',
                  border: `1px solid ${message === t ? accent : '#FED7AA'}`,
                  '&:hover': { bgcolor: message === t ? '#C2410C' : '#FFEDD5' }
                }}
              />
            ))}
          </Box>

          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            label={request.storeResponse ? 'Edit store response' : 'Store response / customer update'}
            placeholder="e.g. Customer has been informed and will visit tomorrow."
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
            helperText={`${message.length}/${MAX_LEN}`}
            sx={{ bgcolor: '#FFFFFF', '& .MuiFormHelperText-root': { textAlign: 'right', bgcolor: '#FFF7ED', m: 0, pt: 0.5 } }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 1.25, alignItems: 'center' }}>
            {loggedInEmployee ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.9, bgcolor: '#FFFFFF', borderRadius: '10px', border: '1px solid #FED7AA', minWidth: 0 }}>
                <UserRound size={15} color={accent} style={{ flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#7C2D12', overflowWrap: 'anywhere' }}>
                  Updated by {loggedInEmployee}
                </Typography>
              </Box>
            ) : (
              <TextField
                select
                size="small"
                label="Updated by (employee)"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                sx={{ bgcolor: '#FFFFFF' }}
              >
                <MenuItem value="">Store Staff</MenuItem>
                {employees.map((emp) => (
                  <MenuItem key={emp._id} value={emp.employeeName}>
                    {emp.employeeName}{emp.designation ? ` · ${emp.designation}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button
              variant="contained"
              disableElevation
              onClick={handleSave}
              disabled={saving || !trimmed || unchanged}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <Send size={16} />}
              sx={{ borderRadius: '10px', fontWeight: 800, px: 3, py: 1, bgcolor: accent, '&:hover': { bgcolor: '#C2410C' } }}
            >
              {request.storeResponse ? 'Update' : 'Send update'}
            </Button>
          </Box>

          <HistoryList history={request.storeResponseHistory} accent={accent} />
        </Box>
      )}
    </Card>
  );
};

export default StoreResponsePanel;
