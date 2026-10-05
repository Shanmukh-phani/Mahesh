import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { format } from 'date-fns';

const ACTIONS = {
  CREATED: { label: 'Request raised', color: '#2563EB' },
  AUTO_FORWARDED: { label: 'Sent to main branch automatically', color: '#64748B' },
  EXECUTIVE_APPROVED: { label: 'Approved by executive', color: '#7C3AED' },
  EXECUTIVE_REJECTED: { label: 'Rejected by executive', color: '#DC2626' },
  STATUS_UPDATE: { label: 'Main branch update', color: '#0D9488' },
  STORE_UPDATE: { label: 'Store update', color: '#EA580C' }
};

export const approvalInfo = (req) => {
  if (!req) return null;
  if (req.approvalStage === 'PENDING_EXECUTIVE') {
    return { key: 'pending', label: 'Awaiting executive approval', short: 'At executive', bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' };
  }
  if (req.approvalStage === 'REJECTED_BY_EXECUTIVE') {
    return { key: 'rejected', label: `Rejected by executive${req.executiveReview?.by ? ` · ${req.executiveReview.by}` : ''}`, short: 'Exec rejected', bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5' };
  }
  if (req.executiveReview?.decision === 'Approved') {
    return { key: 'approved', label: `Executive approved${req.executiveReview.by ? ` · ${req.executiveReview.by}` : ''}`, short: 'Exec approved', bg: '#EDE9FE', color: '#5B21B6', border: '#C4B5FD' };
  }
  return null;
};

export const ApprovalChip = ({ request, short = false, sx }) => {
  const info = approvalInfo(request);
  if (!info) return null;
  return (
    <Chip
      size="small"
      label={short ? info.short : info.label}
      title={info.label}
      sx={{ bgcolor: info.bg, color: info.color, border: `1px solid ${info.border}`, fontWeight: 800, fontSize: '0.68rem', height: 22, maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }, ...sx }}
    />
  );
};

export const LastUpdatedBy = ({ request, sx }) => {
  if (!request?.lastUpdatedBy) return null;
  return (
    <Typography sx={{ color: '#94A3B8', fontSize: '0.68rem', fontWeight: 700, overflowWrap: 'anywhere', ...sx }}>
      Last change by {request.lastUpdatedBy}
    </Typography>
  );
};

export const ActionLogTimeline = ({ request, title = 'Activity trail' }) => {
  const log = [...(request?.actionLog || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!log.length) return null;
  return (
    <Box>
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', letterSpacing: '0.5px', mb: 1 }}>{title.toUpperCase()}</Typography>
      <Box sx={{ position: 'relative', pl: 2.25 }}>
        <Box sx={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, bgcolor: '#E2E8F0', borderRadius: 1 }} />
        {log.map((entry, i) => {
          const meta = ACTIONS[entry.action] || { label: entry.action, color: '#64748B' };
          return (
            <Box key={entry._id || i} sx={{ position: 'relative', mb: i === log.length - 1 ? 0 : 1.5 }}>
              <Box sx={{ position: 'absolute', left: -20, top: 4, width: 12, height: 12, borderRadius: '50%', bgcolor: meta.color, border: '2px solid #FFFFFF', boxShadow: `0 0 0 1px ${meta.color}` }} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', color: meta.color }}>{meta.label}</Typography>
                {entry.status && entry.action === 'STATUS_UPDATE' && (
                  <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#0F172A' }}>→ {entry.status}</Typography>
                )}
              </Box>
              <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, overflowWrap: 'anywhere' }}>
                {entry.by || 'System'}{entry.createdAt ? ` · ${format(new Date(entry.createdAt), 'dd MMM yyyy, p')}` : ''}
              </Typography>
              {entry.note && (
                <Typography sx={{ fontSize: '0.75rem', color: '#334155', mt: 0.25, overflowWrap: 'anywhere' }}>"{entry.note}"</Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
