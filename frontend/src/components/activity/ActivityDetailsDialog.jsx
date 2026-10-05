import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, IconButton, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { X, ArrowRight } from 'lucide-react';
import { dialogPaperSx } from '../admin/AdminChrome';
import { CategoryIcon, RoleChip, Pill2 } from './ActivityBits';
import { categoryInfo, fmtTime, fmtValue, fieldLabel, ago } from './activityUtils';

const Row = ({ label, value }) => (value === undefined || value === null || value === '' ? null : (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr' }, gap: { xs: 0.2, sm: 1.5 }, py: 0.9, borderBottom: '1px dashed #E2E8F0' }}>
    <Typography sx={{ color: '#64748B', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</Typography>
    <Typography component="div" sx={{ color: '#0F172A', fontWeight: 600, fontSize: '0.86rem', wordBreak: 'break-word' }}>{value}</Typography>
  </Box>
));

const ActivityDetailsDialog = ({ log, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  if (!log) return null;
  const failed = log.outcome === 'FAILED';
  const input = log.details?.input;

  return (
    <Dialog open={Boolean(log)} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} slotProps={{ paper: { sx: fullScreen ? {} : dialogPaperSx } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pr: 6 }}>
        <CategoryIcon category={log.category} failed={failed} size={40} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem', lineHeight: 1.35 }}>{log.summary || log.action}</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
            <Pill2 label={categoryInfo(log.category).label} bg={`${categoryInfo(log.category).color}17`} color={categoryInfo(log.category).color} />
            <Pill2 label={failed ? 'Failed' : 'Success'} bg={failed ? '#FEE2E2' : '#DCFCE7'} color={failed ? '#B91C1C' : '#15803D'} />
            {log.source === 'AI_ASSISTANT' && <Pill2 label="Via Ask AI" bg="#EEF2FF" color="#4338CA" />}
          </Box>
        </Box>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="Close"><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Row label="When" value={`${fmtTime(log.at)} (${ago(log.at)})`} />
        <Row
          label="Who"
          value={(
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <span>{log.actorName || log.actorUsername || 'Unknown'}{log.actorUsername && log.actorName !== log.actorUsername ? ` (${log.actorUsername})` : ''}</span>
              <RoleChip role={log.actorRole} adminLevel={log.adminLevel} designation={log.designation} />
            </Box>
          )}
        />
        <Row label="Store" value={log.storeCode ? `${log.storeCode} — ${log.storeName || ''}` : ''} />
        <Row label="Record" value={log.entityLabel} />
        <Row label="Action code" value={log.action} />
        <Row label="Error" value={log.errorMessage && <Box component="span" sx={{ color: '#B91C1C' }}>{log.errorMessage}</Box>} />
        <Row label="Device" value={log.device} />
        <Row label="IP address" value={log.ip} />
        <Row label="API call" value={log.method ? `${log.method} ${log.path || ''}${log.statusCode ? ` → ${log.statusCode}` : ''}${log.durationMs !== undefined ? ` in ${log.durationMs} ms` : ''}` : log.path} />
        {log.details?.attemptedLogin && <Row label="Login typed" value={log.details.attemptedLogin} />}
        {log.details?.rows !== undefined && <Row label="Rows" value={log.details.rows} />}
        {log.details?.durationMs !== undefined && <Row label="Session length" value={`${Math.round(log.details.durationMs / 60000)} min`} />}

        {log.changes?.length > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem', mb: 1 }}>What changed ({log.changes.length})</Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {log.changes.map((c) => (
                <Box key={c.field} sx={{ p: 1.25, borderRadius: '12px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
                  <Typography sx={{ fontWeight: 800, color: '#334155', fontSize: '0.78rem', mb: 0.5 }}>{fieldLabel(c.field)}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '8px', bgcolor: '#FEE2E2', color: '#991B1B', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'line-through', wordBreak: 'break-word', maxWidth: '100%' }}>{fmtValue(c.from)}</Box>
                    <ArrowRight size={14} color="#64748B" />
                    <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '8px', bgcolor: '#DCFCE7', color: '#166534', fontSize: '0.8rem', fontWeight: 700, wordBreak: 'break-word', maxWidth: '100%' }}>{fmtValue(c.to)}</Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {input && typeof input === 'object' && Object.keys(input).length > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem', mb: 1 }}>Data sent</Typography>
            <Box sx={{ borderRadius: '12px', border: '1px solid #E2E8F0', px: 1.5 }}>
              {Object.entries(input).map(([k, v]) => <Row key={k} label={fieldLabel(k)} value={fmtValue(v)} />)}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: '12px', fontWeight: 800 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ActivityDetailsDialog;
