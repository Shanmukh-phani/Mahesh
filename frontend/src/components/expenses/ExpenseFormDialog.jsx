import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, TextField, Typography, MenuItem, InputAdornment, CircularProgress, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { dialogPaperSx, ChoiceChips } from '../admin/AdminChrome';
import { EXPENSE_CATEGORIES, PAYMENT_MODES, monthToDate, currentMonth } from '../../utils/expenses';

const emptyForm = (month) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const date = !month || month === currentMonth() ? today : format(monthToDate(month), 'yyyy-MM-dd');
  return { expenseDate: date, category: '', amount: '', paymentMode: 'Cash', paidTo: '', billNumber: '', description: '' };
};

const ExpenseFormDialog = ({ open, onClose, onSaved, expense, month }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState(emptyForm(month));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    setForm(expense ? {
      expenseDate: format(new Date(expense.expenseDate), 'yyyy-MM-dd'),
      category: expense.category,
      amount: String(expense.amount),
      paymentMode: expense.paymentMode || 'Cash',
      paidTo: expense.paidTo || '',
      billNumber: expense.billNumber || '',
      description: expense.description || ''
    } : emptyForm(month));
  }, [open, expense, month]);

  const errors = {
    expenseDate: !form.expenseDate ? 'Date is required' : form.expenseDate > format(new Date(), 'yyyy-MM-dd') ? 'Date cannot be in the future' : '',
    category: !form.category ? 'Choose a category' : '',
    amount: !(Number(form.amount) > 0) ? 'Enter an amount more than 0' : '',
    description: form.category === 'Other' && !form.description.trim() ? 'Describe the expense' : ''
  };
  const firstError = Object.values(errors).find(Boolean);

  const save = async (e) => {
    e.preventDefault();
    setTried(true);
    if (firstError) {
      toast.error(firstError);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      const res = expense ? await api.put(`/expenses/${expense._id}`, payload) : await api.post('/expenses', payload);
      toast.success(expense ? 'Expense updated' : 'Expense added');
      onSaved(res.data, Boolean(expense));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm" fullScreen={fullScreen} slotProps={{ paper: { sx: fullScreen ? {} : dialogPaperSx } }}>
      <form onSubmit={save} noValidate>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>CATEGORY *</Typography>
              <ChoiceChips options={EXPENSE_CATEGORIES} value={form.category} onChange={(category) => setForm({ ...form, category })} />
              {tried && errors.category && <Typography sx={{ color: '#DC2626', fontSize: '0.75rem', mt: 0.6 }}>{errors.category}</Typography>}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                required
                type="number"
                label="Amount"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                error={tried && Boolean(errors.amount)}
                helperText={tried ? errors.amount : ''}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
              />
              <TextField
                required
                type="date"
                label="Date"
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                error={tried && Boolean(errors.expenseDate)}
                helperText={tried ? errors.expenseDate : ''}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: format(new Date(), 'yyyy-MM-dd') } }}
              />
              <TextField select label="Paid by" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                {PAYMENT_MODES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
              <TextField label="Paid to (optional)" placeholder="e.g. Building owner, TSSPDCL" value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} />
              <TextField label="Bill / receipt no. (optional)" value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
            </Box>
            <TextField
              multiline
              minRows={2}
              label={form.category === 'Other' ? 'Description *' : 'Description (optional)'}
              placeholder="What was this for?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              error={tried && Boolean(errors.description)}
              helperText={tried ? errors.description : ''}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={saving} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null} sx={{ fontWeight: 800, borderRadius: '10px' }}>
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ExpenseFormDialog;
