import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Chip, IconButton, Button } from '@mui/material';
import { X, Clock, UserRound, MessageSquareWarning, History } from 'lucide-react';
import { format } from 'date-fns';
import { dialogPaperSx } from './admin/AdminChrome';
import NotificationContext from './NotificationContext';
import { COMPLAINT_STATUS_STYLE, COMPLAINT_TYPE_STYLE, complaintStoreCode, complaintStoreName } from '../utils/complaints';

const fmtDay = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');
const fmtTime = (d) => (d ? format(new Date(d), 'dd MMM yyyy, h:mm a') : '—');

const Field = ({ label, value, full }) => (
  <Box sx={{ minWidth: 0, gridColumn: full ? '1 / -1' : 'auto' }}>
    <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Typography>
    <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
      {value === undefined || value === null || value === '' ? '—' : value}
    </Typography>
  </Box>
);

const ComplaintDetailsModal = ({ open, onClose, complaint, variant = 'light', actions }) => {
  if (!complaint) return null;
  const c = complaint;
  const history = [...(c.responseHistory || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const isPrice = c.complaintType === 'Price Issue' || c.pricePaid != null || c.expectedPrice != null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { ...dialogPaperSx, m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } }}>
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            <MessageSquareWarning size={20} /> Customer complaint
          </Typography>
          <NotificationContext
            notif={{ requestCode: c.complaintId, storeCode: complaintStoreCode(c), storeName: complaintStoreName(c) }}
            variant={variant}
          />
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close"><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={c.status} sx={{ fontWeight: 800, ...COMPLAINT_STATUS_STYLE[c.status] }} />
          <Chip size="small" label={c.complaintType} sx={{ fontWeight: 800, ...COMPLAINT_TYPE_STYLE[c.complaintType] }} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.75, p: 1.75, borderRadius: '14px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <Field label="Complaint date" value={fmtDay(c.complaintDate || c.createdAt)} />
          <Field label="Customer" value={c.customerName} />
          <Field label="Phone" value={c.customerPhone} />
          <Field label="Entered by" value={c.employeeName} />
          <Field label="Medicine" value={c.medicineName} />
          <Field label="Brand" value={c.medicineBrand} />
          <Field label="Batch no." value={c.batchNumber} />
          <Field label="Bought on" value={c.purchaseDate ? fmtDay(c.purchaseDate) : ''} />
          <Field label="Qty bought" value={c.quantityBought} />
          {isPrice && <Field label="Price paid" value={c.pricePaid != null ? `₹${c.pricePaid}` : ''} />}
          {isPrice && <Field label="Expected price" value={c.expectedPrice != null ? `₹${c.expectedPrice}` : ''} />}
          <Field label="Composition" value={c.composition} full />
        </Box>

        <Box sx={{ p: 1.75, borderRadius: '14px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Complaint</Typography>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#7C2D12', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{c.complaintText}</Typography>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#9A3412', mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <UserRound size={12} /> {c.employeeName} · <Clock size={12} /> {fmtTime(c.createdAt)}
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <History size={14} /> Main branch response
          </Typography>
          {history.length === 0 ? (
            <Typography sx={{ fontSize: '0.85rem', color: '#94A3B8', fontStyle: 'italic' }}>No response from the main branch yet.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {history.map((h, i) => (
                <Box key={h._id || i} sx={{ p: 1.25, borderRadius: '10px', border: '1px solid', borderColor: i === 0 ? '#99F6E4' : '#E2E8F0', bgcolor: i === 0 ? '#F0FDFA' : '#FFFFFF' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip size="small" label={h.status} sx={{ fontWeight: 800, height: 22, ...COMPLAINT_STATUS_STYLE[h.status] }} />
                    <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>{fmtTime(h.createdAt)}{i === 0 ? ' · latest' : ''}</Typography>
                  </Box>
                  {h.message && (
                    <Typography sx={{ fontSize: '0.86rem', color: '#0F172A', fontWeight: 600, mt: 0.75, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{h.message}</Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap' }}>
        {actions}
        <Button onClick={onClose} sx={{ fontWeight: 700, color: '#64748B' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ComplaintDetailsModal;
