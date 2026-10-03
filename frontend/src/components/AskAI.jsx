import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, Typography, IconButton, TextField, Button, Chip, Tooltip, Fab, CircularProgress, Fade,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Sparkles, X, Send, RotateCcw, CheckCircle2, XCircle, AlertTriangle, Bot } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { AI_DATA_CHANGED_EVENT } from '../utils/useAIRefresh';

const getAIBaseURL = () => {
  if (import.meta.env && import.meta.env.VITE_AI_URL) return import.meta.env.VITE_AI_URL;
  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  return `http://${host}:8000`;
};

const aiApi = axios.create({ baseURL: getAIBaseURL(), timeout: 60000 });
aiApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const SUGGESTIONS = {
  ADMIN: [
    'Show pending requests',
    'Which items are low in stock?',
    'Summary of today',
    'Approve MR-10001 with note "will supply tomorrow"',
    'List all stores',
  ],
  MINI_STORE: [
    'Status of my pending requests',
    'Raise a request for Dolo 650 x2',
    'Is Paracetamol available at main branch?',
    'What is low on my shelf?',
    'Any new notifications?',
  ],
};

const MAX_STORED = 60;
const newThreadId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const renderInline = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
  );

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

const MiniTable = ({ rows }) => {
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
  if (!body.length) return null;
  const [head, ...rest] = body.map(splitRow);
  return (
    <Box sx={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', my: 0.5 }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: '100%', '& td, & th': { px: 1, py: 0.6, borderBottom: '1px solid #F1F5F9', textAlign: 'left', whiteSpace: 'nowrap' }, '& th': { bgcolor: '#F8FAFC', fontWeight: 800, color: '#475569' } }}>
        <thead><tr>{head.map((c, i) => <th key={i}>{renderInline(c)}</th>)}</tr></thead>
        <tbody>{rest.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>)}</tbody>
      </Box>
    </Box>
  );
};

const RichText = ({ text }) => {
  const blocks = [];
  String(text || '').split('\n').forEach((raw) => {
    const isRow = /^\s*\|.*\|\s*$/.test(raw);
    const last = blocks[blocks.length - 1];
    if (isRow && last?.table) last.rows.push(raw);
    else if (isRow) blocks.push({ table: true, rows: [raw] });
    else blocks.push({ line: raw });
  });
  return (
    <Box sx={{ '& p': { m: 0 }, display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
      {blocks.map((block, i) => {
        if (block.table) return <MiniTable key={i} rows={block.rows} />;
        const line = block.line.trimEnd();
        if (!line.trim()) return <Box key={i} sx={{ height: 4 }} />;
        const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (bullet) {
          return (
            <Box key={i} sx={{ display: 'flex', gap: 0.75, pl: 0.5 }}>
              <Box component="span" sx={{ opacity: 0.6, flexShrink: 0 }}>•</Box>
              <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{renderInline(bullet[1])}</Box>
            </Box>
          );
        }
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
          return <Typography key={i} sx={{ fontWeight: 800, fontSize: '0.85rem' }}>{renderInline(heading[1])}</Typography>;
        }
        return <Box key={i} component="p" sx={{ overflowWrap: 'anywhere' }}>{renderInline(line)}</Box>;
      })}
    </Box>
  );
};

const ActionCard = ({ action, brand, onConfirm, onCancel }) => {
  const done = action.state === 'done';
  const failed = action.state === 'failed';
  const cancelled = action.state === 'cancelled';
  const busy = action.state === 'busy';
  const accent = action.danger ? '#DC2626' : brand.main;

  return (
    <Box
      sx={{
        mt: 1, p: 1.5, borderRadius: '12px', bgcolor: '#FFFFFF',
        border: `1px solid ${done ? '#BBF7D0' : failed ? '#FECACA' : cancelled ? '#E2E8F0' : action.danger ? '#FECACA' : brand.border}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        {action.danger && !done && !cancelled ? <AlertTriangle size={14} color="#DC2626" /> : <Sparkles size={14} color={accent} />}
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: accent }}>
          {action.title}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.84rem', color: '#0F172A', fontWeight: 600, overflowWrap: 'anywhere' }}>
        {action.summary}
      </Typography>

      {done || failed || cancelled ? (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
          {done && <CheckCircle2 size={15} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />}
          {failed && <XCircle size={15} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />}
          {cancelled && <XCircle size={15} color="#94A3B8" style={{ flexShrink: 0, marginTop: 1 }} />}
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: done ? '#15803D' : failed ? '#B91C1C' : '#64748B' }}>
            {action.result || (cancelled ? 'Cancelled' : '')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 1.25, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="contained"
            disableElevation
            disabled={busy}
            onClick={onConfirm}
            startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <CheckCircle2 size={14} />}
            sx={{
              bgcolor: accent, borderRadius: '8px', fontWeight: 700, textTransform: 'none', px: 1.75,
              '&:hover': { bgcolor: action.danger ? '#B91C1C' : brand.dark },
            }}
          >
            {action.danger ? 'Yes, do it' : 'Confirm'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={onCancel}
            sx={{ borderRadius: '8px', fontWeight: 700, textTransform: 'none', color: '#475569', borderColor: '#CBD5E1' }}
          >
            Cancel
          </Button>
        </Box>
      )}
    </Box>
  );
};

const AskAI = () => {
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const brand = theme.palette.brand || { main: theme.palette.primary.main, dark: theme.palette.primary.dark, soft: '#F1F5F9', border: '#E2E8F0' };
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));

  const role = user?.role === 'ADMIN' ? 'ADMIN' : 'MINI_STORE';
  const storageKey = user?._id ? `medconnect_ai_${user._id}` : null;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [threadId, setThreadId] = useState(newThreadId);
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved?.threadId) {
        setThreadId(saved.threadId);
        setMessages(Array.isArray(saved.messages) ? saved.messages : []);
      }
    } catch {
      /* ignore corrupt history */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ threadId, messages: messages.slice(-MAX_STORED) }));
  }, [storageKey, threadId, messages]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, open]);

  useEffect(() => {
    if (open && !isXs) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open, isXs]);

  const greeting = useMemo(
    () =>
      role === 'ADMIN'
        ? 'Hi! I can find requests, approve or update their status, manage warehouse stock, stores, employees and customers. What do you need?'
        : `Hi! I can raise requests for customers, track your requests, check main-branch availability and update your shelf stock${user?.store?.storeCode ? ` for ${user.store.storeCode}` : ''}. How can I help?`,
    [role, user]
  );

  const patchAction = (id, patch) =>
    setMessages((prev) =>
      prev.map((m) => (m.actions ? { ...m, actions: m.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : m))
    );

  const send = async (textArg) => {
    const text = (textArg ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setSending(true);
    try {
      const { data } = await aiApi.post('/chat', { message: text, thread_id: threadId });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.reply, error: !!data.error, actions: (data.actions || []).map((a) => ({ ...a, state: 'pending' })) },
      ]);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : err.response
          ? 'Something went wrong. Please try again.'
          : 'The AI service is offline. Start it from the AI folder (python run.py) and try again.';
      setMessages((prev) => [...prev, { role: 'assistant', text: msg, error: true }]);
    } finally {
      setSending(false);
    }
  };

  const confirmAction = async (action) => {
    patchAction(action.id, { state: 'busy' });
    try {
      const { data } = await aiApi.post(`/actions/${action.id}/confirm`);
      if (data.ok) {
        patchAction(action.id, { state: 'done', result: data.message });
        toast.success(data.message || 'Done');
        window.dispatchEvent(new CustomEvent(AI_DATA_CHANGED_EVENT));
      } else {
        patchAction(action.id, { state: 'failed', result: data.message });
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      patchAction(action.id, { state: 'failed', result: typeof detail === 'string' ? detail : 'Could not reach the AI service.' });
    }
  };

  const cancelAction = async (action) => {
    patchAction(action.id, { state: 'cancelled', result: 'Cancelled' });
    try {
      await aiApi.post(`/actions/${action.id}/cancel`);
    } catch {
      /* cancelling locally is enough */
    }
  };

  const resetChat = () => {
    setMessages([]);
    setThreadId(newThreadId());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  if (!user) return null;

  const panelSx = isXs
    ? { position: 'fixed', inset: 0, borderRadius: 0 }
    : {
        position: 'fixed',
        right: 24,
        bottom: 92,
        width: 400,
        maxWidth: 'calc(100vw - 48px)',
        height: 'min(640px, calc(100vh - 120px))',
        borderRadius: '18px',
      };

  return (
    <>
      <Fade in={open} unmountOnExit>
        <Paper
          elevation={0}
          role="dialog"
          aria-label="Ask AI"
          sx={{
            ...panelSx,
            zIndex: theme.zIndex.drawer + 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: '#F8FAFC',
            border: isXs ? 'none' : '1px solid #E2E8F0',
            boxShadow: isXs ? 'none' : '0 24px 60px -12px rgba(15,23,42,0.28)',
          }}
        >
          <Box
            sx={{
              px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25,
              bgcolor: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
              pt: isXs ? 'max(12px, env(safe-area-inset-top))' : 1.5,
            }}
          >
            <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: brand.main, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={18} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A', lineHeight: 1.2 }}>Ask AI</Typography>
              <Typography noWrap sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                {role === 'ADMIN' ? 'Main branch assistant' : `Store assistant${user?.store?.storeCode ? ` · ${user.store.storeCode}` : ''}`}
              </Typography>
            </Box>
            <Tooltip title="New chat">
              <span>
                <IconButton size="small" onClick={resetChat} disabled={sending || messages.length === 0} sx={{ color: '#64748B' }}>
                  <RotateCcw size={17} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Close">
              <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#64748B' }}>
                <X size={19} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box ref={listRef} sx={{ flex: 1, overflowY: 'auto', px: { xs: 1.5, sm: 2 }, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '8px', bgcolor: brand.soft, color: brand.main, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={16} />
              </Box>
              <Box sx={{ bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '4px 14px 14px 14px', px: 1.5, py: 1.1, fontSize: '0.86rem', color: '#1E293B', maxWidth: '85%' }}>
                {greeting}
              </Box>
            </Box>

            {messages.length === 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, pl: { xs: 0, sm: 4.5 } }}>
                {SUGGESTIONS[role].map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    onClick={() => send(s)}
                    size="small"
                    sx={{
                      height: 'auto', py: 0.6, borderRadius: '10px', fontWeight: 600, fontSize: '0.76rem',
                      bgcolor: '#FFFFFF', border: `1px solid ${brand.border}`, color: brand.dark,
                      '& .MuiChip-label': { whiteSpace: 'normal' },
                      '&:hover': { bgcolor: brand.soft },
                    }}
                  />
                ))}
              </Box>
            )}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Box sx={{ bgcolor: brand.main, color: '#FFFFFF', borderRadius: '14px 4px 14px 14px', px: 1.5, py: 1.1, fontSize: '0.86rem', maxWidth: '85%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {m.text}
                  </Box>
                </Box>
              ) : (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ width: 28, height: 28, borderRadius: '8px', bgcolor: m.error ? '#FEF2F2' : brand.soft, color: m.error ? '#DC2626' : brand.main, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {m.error ? <AlertTriangle size={15} /> : <Bot size={16} />}
                  </Box>
                  <Box sx={{ maxWidth: '85%', minWidth: 0, flex: m.actions?.length ? 1 : '0 1 auto' }}>
                    <Box sx={{ bgcolor: m.error ? '#FEF2F2' : '#FFFFFF', border: `1px solid ${m.error ? '#FECACA' : '#E2E8F0'}`, borderRadius: '4px 14px 14px 14px', px: 1.5, py: 1.1, fontSize: '0.86rem', color: m.error ? '#991B1B' : '#1E293B' }}>
                      <RichText text={m.text} />
                    </Box>
                    {(m.actions || []).map((a) => (
                      <ActionCard key={a.id} action={a} brand={brand} onConfirm={() => confirmAction(a)} onCancel={() => cancelAction(a)} />
                    ))}
                  </Box>
                </Box>
              )
            )}

            {sending && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '8px', bgcolor: brand.soft, color: brand.main, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={16} />
                </Box>
                <Box sx={{ bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '4px 14px 14px 14px', px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={13} sx={{ color: brand.main }} />
                  <Typography sx={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Thinking…</Typography>
                </Box>
              </Box>
            )}
          </Box>

          <Box
            sx={{
              p: 1.25, bgcolor: '#FFFFFF', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 1, alignItems: 'flex-end',
              pb: isXs ? 'max(10px, env(safe-area-inset-bottom))' : 1.25,
            }}
          >
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={4}
              size="small"
              placeholder={role === 'ADMIN' ? 'e.g. Mark MR-10002 as ordered' : 'e.g. Request Dolo 650 x2 for Ravi 9876543210'}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 2000))}
              onKeyDown={handleKeyDown}
              disabled={sending}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px', fontSize: '0.88rem', bgcolor: '#F8FAFC',
                  '&.Mui-focused fieldset': { borderColor: brand.main },
                },
              }}
            />
            <IconButton
              onClick={() => send()}
              disabled={sending || !input.trim()}
              aria-label="Send"
              sx={{
                width: 40, height: 40, borderRadius: '12px', bgcolor: brand.main, color: '#FFFFFF', flexShrink: 0,
                '&:hover': { bgcolor: brand.dark },
                '&.Mui-disabled': { bgcolor: '#E2E8F0', color: '#94A3B8' },
              }}
            >
              <Send size={17} />
            </IconButton>
          </Box>
        </Paper>
      </Fade>

      {!(open && isXs) && (
        <Fab
          variant={isXs ? 'circular' : 'extended'}
          onClick={() => setOpen((v) => !v)}
          aria-label="Ask AI"
          sx={{
            position: 'fixed',
            right: { xs: 16, sm: 24 },
            bottom: { xs: 'max(16px, env(safe-area-inset-bottom))', sm: 24 },
            zIndex: theme.zIndex.drawer + 50,
            bgcolor: brand.main,
            color: '#FFFFFF',
            textTransform: 'none',
            fontWeight: 800,
            gap: 1,
            boxShadow: '0 10px 25px -8px rgba(15,23,42,0.45)',
            '&:hover': { bgcolor: brand.dark },
          }}
        >
          {open ? <X size={20} /> : <Sparkles size={20} />}
          {!isXs && (open ? 'Close' : 'Ask AI')}
        </Fab>
      )}
    </>
  );
};

export default AskAI;
