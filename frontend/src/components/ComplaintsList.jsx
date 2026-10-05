import React from 'react';
import { Box, Typography, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { UserRound, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import NotificationContext from './NotificationContext';
import { COMPLAINT_STATUS_STYLE, COMPLAINT_TYPE_STYLE, complaintStoreCode, complaintStoreName } from '../utils/complaints';

const clampSx = (lines) => ({ overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });
const fmtDay = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');

const tagOf = (c, showStore) => ({
  requestCode: c.complaintId,
  storeCode: showStore ? complaintStoreCode(c) : '',
  storeName: showStore ? complaintStoreName(c) : ''
});

const StatusChip = ({ status }) => (
  <Chip size="small" label={status} sx={{ fontWeight: 800, ...COMPLAINT_STATUS_STYLE[status] }} />
);

const TypeChip = ({ type }) => (
  <Chip size="small" label={type} sx={{ fontWeight: 700, height: 22, fontSize: '0.68rem', maxWidth: '100%', ...COMPLAINT_TYPE_STYLE[type] }} />
);

const medicineMeta = (c) => [
  c.medicineBrand,
  c.batchNumber ? `Batch ${c.batchNumber}` : '',
  c.quantityBought != null ? `Qty ${c.quantityBought}` : '',
  c.purchaseDate ? `Bought ${fmtDay(c.purchaseDate)}` : ''
].filter(Boolean).join(' · ');

/**
 * Complaints as a table (lg+) and cards (below lg).
 * renderActions(complaint) returns buttons; clicks should stopPropagation so the row click (onOpen) doesn't fire.
 */
const ComplaintsList = ({ complaints, onOpen, renderActions, showStore = false, variant = 'light' }) => (
  <>
    <Box sx={{ display: { xs: 'grid', lg: 'none' }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, p: { xs: 1.5, md: 2 } }}>
      {complaints.map((c) => (
        <Box
          key={c._id}
          onClick={() => onOpen(c)}
          sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, cursor: 'pointer' }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <NotificationContext notif={{ requestCode: c.complaintId }} variant={variant} sx={{ mt: 0, flexShrink: 0 }} />
            <StatusChip status={c.status} />
          </Box>
          {showStore && (
            <NotificationContext notif={{ storeCode: complaintStoreCode(c), storeName: complaintStoreName(c) }} variant={variant} sx={{ mt: 0 }} />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem', overflowWrap: 'anywhere' }}>{c.medicineName}</Typography>
            {medicineMeta(c) && <Typography sx={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{medicineMeta(c)}</Typography>}
            {c.composition && <Typography title={c.composition} sx={{ color: '#94A3B8', fontSize: '0.72rem', ...clampSx(2) }}>{c.composition}</Typography>}
          </Box>
          <TypeChip type={c.complaintType} />
          <Typography sx={{ fontSize: '0.84rem', color: '#7C2D12', fontWeight: 600, ...clampSx(3) }}>{c.complaintText}</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, overflowWrap: 'anywhere' }}>
            {c.customerName} · {c.customerPhone}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
            <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarDays size={12} /> {fmtDay(c.complaintDate || c.createdAt)}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <UserRound size={12} /> {c.employeeName}
            </Typography>
          </Box>
          {c.adminResponse && (
            <Box sx={{ p: 1, borderRadius: '10px', bgcolor: '#F0FDFA', border: '1px solid #99F6E4' }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#134E4A', fontWeight: 600, ...clampSx(3) }}>
                <Box component="span" sx={{ fontWeight: 800 }}>Main branch: </Box>{c.adminResponse}
              </Typography>
            </Box>
          )}
          {renderActions && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto', pt: 0.5 }}>{renderActions(c)}</Box>
          )}
        </Box>
      ))}
    </Box>

    <TableContainer sx={{ display: { xs: 'none', lg: 'block' }, overflowX: 'auto' }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>{showStore ? 'Complaint / store' : 'Complaint'}</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Medicine</TableCell>
            <TableCell>Complaint</TableCell>
            <TableCell>Entered by</TableCell>
            <TableCell align="center">Status</TableCell>
            <TableCell>Response</TableCell>
            {renderActions && <TableCell align="right">Action</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {complaints.map((c) => (
            <TableRow key={c._id} hover onClick={() => onOpen(c)} sx={{ cursor: 'pointer', verticalAlign: 'top' }}>
              <TableCell sx={{ maxWidth: 200 }}>
                <NotificationContext notif={tagOf(c, showStore)} variant={variant} sx={{ mt: 0, flexDirection: 'column', alignItems: 'flex-start' }} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmtDay(c.complaintDate || c.createdAt)}</TableCell>
              <TableCell sx={{ maxWidth: 160 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', overflowWrap: 'anywhere' }}>{c.customerName}</Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{c.customerPhone}</Typography>
              </TableCell>
              <TableCell sx={{ maxWidth: 240 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.86rem', overflowWrap: 'anywhere' }}>{c.medicineName}</Typography>
                {medicineMeta(c) && <Typography sx={{ color: '#64748B', fontSize: '0.72rem', overflowWrap: 'anywhere' }}>{medicineMeta(c)}</Typography>}
                {c.composition && <Typography title={c.composition} sx={{ color: '#94A3B8', fontSize: '0.7rem', ...clampSx(2) }}>{c.composition}</Typography>}
              </TableCell>
              <TableCell sx={{ maxWidth: 280 }}>
                <TypeChip type={c.complaintType} />
                <Typography title={c.complaintText} sx={{ fontSize: '0.8rem', color: '#475569', mt: 0.5, ...clampSx(3) }}>{c.complaintText}</Typography>
              </TableCell>
              <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600, maxWidth: 140, overflowWrap: 'anywhere' }}>{c.employeeName}</TableCell>
              <TableCell align="center"><StatusChip status={c.status} /></TableCell>
              <TableCell sx={{ maxWidth: 240 }}>
                <Typography title={c.adminResponse || ''} sx={{ fontSize: '0.8rem', color: c.adminResponse ? '#134E4A' : '#94A3B8', ...clampSx(3) }}>
                  {c.adminResponse || 'Awaiting response'}
                </Typography>
              </TableCell>
              {renderActions && (
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{renderActions(c)}</Box>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </>
);

export default ComplaintsList;
