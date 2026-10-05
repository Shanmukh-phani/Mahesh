import React, { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import { HandCoins, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { money } from '../../utils/expenses';
import { dialogPaperSx } from '../admin/AdminChrome';

/** Store: one row per month the executive officer marked as paid, until the store confirms. */
const ExpensePaymentConfirm = ({ status, onDone, sx }) => {
  const [answer, setAnswer] = useState(null); // { item, received }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const items = status?.toConfirm || [];
  if (!items.length) return null;

  const open = (item, received) => { setAnswer({ item, received }); setNote(''); };

  const submit = async () => {
    if (!answer.received && !note.trim()) {
      toast.error('Please write what is wrong');
      return;
    }
    setBusy(true);
    try {
      await api.put('/expenses/confirm-payment', { month: answer.item.month, received: answer.received, note });
      toast.success(answer.received ? 'Thanks! Payment confirmed' : 'Your executive officer was told the payment did not arrive');
      setAnswer(null);
      onDone?.(answer.item.month);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.25, ...sx }}>
      {items.map((item) => (
        <Box key={item.month} sx={{ p: { xs: 1.75, md: 2 }, borderRadius: '16px', border: '1px solid #BFDBFE', bgcolor: '#EFF6FF', display: 'flex', gap: 1.5, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#DBEAFE', color: '#1D4ED8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <HandCoins size={20} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: '#1E3A8A', fontSize: '0.95rem' }}>
                {money(item.total)} paid for {item.label} expenses. Did you receive it?
              </Typography>
              <Typography sx={{ color: '#1E40AF', fontSize: '0.78rem', fontWeight: 600, mt: 0.3, wordBreak: 'break-word' }}>
                {item.count} expense{item.count === 1 ? '' : 's'} · paid by {item.paidBy || 'your executive officer'}
                {item.paidAt ? ` on ${format(new Date(item.paidAt), 'dd MMM, hh:mm a')}` : ''}
                {item.payoutMode ? ` · ${item.payoutMode}` : ''}{item.payoutReference ? ` · Ref ${item.payoutReference}` : ''}
                {item.payoutNote ? ` · "${item.payoutNote}"` : ''}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', md: 'auto' }, flexShrink: 0 }}>
            <Button variant="contained" color="success" startIcon={<CheckCircle2 size={16} />} onClick={() => open(item, true)} sx={{ borderRadius: '10px', fontWeight: 800, flex: { xs: 1, md: 'none' }, whiteSpace: 'nowrap' }}>
              Yes, received
            </Button>
            <Button variant="outlined" color="error" startIcon={<XCircle size={16} />} onClick={() => open(item, false)} sx={{ borderRadius: '10px', fontWeight: 800, flex: { xs: 1, md: 'none' }, whiteSpace: 'nowrap', bgcolor: '#FFFFFF' }}>
              Not received
            </Button>
          </Box>
        </Box>
      ))}

      <Dialog open={Boolean(answer)} onClose={() => !busy && setAnswer(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>{answer?.received ? 'Confirm payment received' : 'Payment not received?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: '0.9rem', mb: 2 }}>
            {answer?.received
              ? `You confirm the store received ${money(answer?.item.total)} for ${answer?.item.label} expenses.`
              : `Your executive officer will be told that ${money(answer?.item.total)} for ${answer?.item.label} did not arrive, so they can pay again or check.`}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            autoFocus={!answer?.received}
            required={!answer?.received}
            label={answer?.received ? 'Note (optional)' : 'What is wrong? *'}
            placeholder={answer?.received ? '' : 'e.g. Not received yet / received only ₹2,000'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAnswer(null)} disabled={busy} sx={{ fontWeight: 800 }}>Cancel</Button>
          <Button variant="contained" color={answer?.received ? 'success' : 'error'} onClick={submit} disabled={busy} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            {busy ? 'Saving...' : answer?.received ? 'Yes, received' : 'Report not received'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExpensePaymentConfirm;
