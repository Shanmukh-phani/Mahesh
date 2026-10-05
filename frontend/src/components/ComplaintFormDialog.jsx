import React, { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, MenuItem, Button, CircularProgress, IconButton, InputAdornment
} from '@mui/material';
import { X, MessageSquareWarning } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';
import { dialogPaperSx, ChoiceChips } from './admin/AdminChrome';
import { COMPLAINT_TYPES } from '../utils/complaints';

const ORANGE = '#EA580C';
const TEXT_MAX = 2000;

const toInputDate = (d) => (d ? format(new Date(d), 'yyyy-MM-dd') : '');

const emptyForm = () => ({
  complaintDate: toInputDate(new Date()),
  customerName: '',
  customerPhone: '',
  medicineName: '',
  medicineBrand: '',
  batchNumber: '',
  composition: '',
  purchaseDate: '',
  quantityBought: '',
  complaintType: COMPLAINT_TYPES[0],
  pricePaid: '',
  expectedPrice: '',
  complaintText: '',
  employeeName: ''
});

const fromComplaint = (c) => ({
  complaintDate: toInputDate(c.complaintDate || c.createdAt),
  customerName: c.customerName || '',
  customerPhone: c.customerPhone || '',
  medicineName: c.medicineName || '',
  medicineBrand: c.medicineBrand || '',
  batchNumber: c.batchNumber || '',
  composition: c.composition || '',
  purchaseDate: toInputDate(c.purchaseDate),
  quantityBought: c.quantityBought ?? '',
  complaintType: c.complaintType || COMPLAINT_TYPES[0],
  pricePaid: c.pricePaid ?? '',
  expectedPrice: c.expectedPrice ?? '',
  complaintText: c.complaintText || '',
  employeeName: c.employeeName || ''
});

const SectionLabel = ({ children }) => (
  <Typography sx={{ gridColumn: '1 / -1', fontWeight: 800, fontSize: '0.72rem', color: '#64748B', letterSpacing: '0.5px', textTransform: 'uppercase', mt: 0.5 }}>
    {children}
  </Typography>
);

const ComplaintFormDialog = ({ open, onClose, complaint, onSaved }) => {
  const isEdit = Boolean(complaint?._id);
  const { user } = useContext(AuthContext);
  const loggedInEmployee = user?.employee?.employeeName || '';
  const [form, setForm] = useState(emptyForm);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const lastLookup = useRef('');

  useEffect(() => {
    if (!open) return;
    setForm(complaint ? fromComplaint(complaint) : { ...emptyForm(), employeeName: loggedInEmployee });
    lastLookup.current = complaint?.customerPhone || '';
    if (loggedInEmployee) return;
    api.get('/complaints/employees')
      .then((res) => {
        const list = res.data || [];
        setEmployees(list);
        if (!complaint && list.length === 1) setForm((prev) => ({ ...prev, employeeName: list[0].employeeName }));
      })
      .catch(() => setEmployees([]));
  }, [open, complaint, loggedInEmployee]);

  useEffect(() => {
    const phone = form.customerPhone.trim();
    if (!open || phone.length < 10 || phone === lastLookup.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/customers?search=${encodeURIComponent(phone)}`);
        const match = (res.data || []).find((c) => String(c.phone) === phone);
        lastLookup.current = phone;
        if (match?.name) setForm((prev) => (prev.customerName ? prev : { ...prev, customerName: match.name }));
      } catch {
        /* lookup is a convenience only */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.customerPhone, open]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.medicineName.trim() || !form.complaintText.trim()) {
      toast.error('Fill customer name, phone, medicine and complaint');
      return;
    }
    if (!form.employeeName) {
      toast.error('Select the employee entering this complaint');
      return;
    }
    setSaving(true);
    try {
      const payload = form.complaintType === 'Price Issue' ? { ...form } : { ...form, pricePaid: '', expectedPrice: '' };
      const res = isEdit
        ? await api.put(`/complaints/${complaint._id}`, payload)
        : await api.post('/complaints', payload);
      toast.success(isEdit ? 'Complaint updated' : `Complaint ${res.data.complaintId} sent to main branch`);
      onSaved?.(res.data, isEdit);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save complaint');
    } finally {
      setSaving(false);
    }
  };

  const isPrice = form.complaintType === 'Price Issue';
  const today = toInputDate(new Date());

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { ...dialogPaperSx, m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ p: 1, borderRadius: '12px', bgcolor: '#FFEDD5', color: ORANGE, display: 'flex', flexShrink: 0 }}>
              <MessageSquareWarning size={20} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>{isEdit ? `Edit complaint ${complaint.complaintId}` : 'New customer complaint'}</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>Sent to the main branch as soon as you save.</Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} disabled={saving} size="small" aria-label="Close"><X size={18} /></IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <SectionLabel>Customer</SectionLabel>
            <TextField
              label="Complaint date"
              type="date"
              value={form.complaintDate}
              onChange={set('complaintDate')}
              size="small"
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
            />
            {loggedInEmployee ? (
              <TextField
                label="Entered by"
                value={form.employeeName || loggedInEmployee}
                size="small"
                disabled
                helperText={isEdit ? 'Original employee is kept' : 'Your login'}
              />
            ) : (
              <TextField
                select
                required
                label="Entered by (employee)"
                value={form.employeeName}
                onChange={set('employeeName')}
                size="small"
                helperText={employees.length ? '' : 'No active employees found for this store'}
              >
                {employees.map((emp) => (
                  <MenuItem key={emp._id} value={emp.employeeName}>
                    {emp.employeeName}{emp.designation ? ` · ${emp.designation}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              required
              label="Customer phone"
              value={form.customerPhone}
              onChange={set('customerPhone')}
              size="small"
              slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 15 } }}
            />
            <TextField required label="Customer name" value={form.customerName} onChange={set('customerName')} size="small" />

            <SectionLabel>Medicine</SectionLabel>
            <TextField required label="Medicine name" value={form.medicineName} onChange={set('medicineName')} size="small" />
            <TextField label="Brand / manufacturer" value={form.medicineBrand} onChange={set('medicineBrand')} size="small" />
            <TextField label="Batch number" value={form.batchNumber} onChange={set('batchNumber')} size="small" />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Bought on"
                type="date"
                value={form.purchaseDate}
                onChange={set('purchaseDate')}
                size="small"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
              />
              <TextField
                label="Qty bought"
                type="number"
                value={form.quantityBought}
                onChange={set('quantityBought')}
                size="small"
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Box>
            <TextField
              label="Composition"
              value={form.composition}
              onChange={set('composition')}
              size="small"
              multiline
              minRows={2}
              maxRows={5}
              sx={{ gridColumn: '1 / -1' }}
            />

            <SectionLabel>Complaint</SectionLabel>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <ChoiceChips options={COMPLAINT_TYPES} value={form.complaintType} onChange={(complaintType) => setForm((prev) => ({ ...prev, complaintType }))} color={ORANGE} />
            </Box>
            {isPrice && (
              <>
                <TextField
                  label="Price paid"
                  type="number"
                  value={form.pricePaid}
                  onChange={set('pricePaid')}
                  size="small"
                  slotProps={{ htmlInput: { min: 0, step: '0.01' }, input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                />
                <TextField
                  label="Expected price / MRP"
                  type="number"
                  value={form.expectedPrice}
                  onChange={set('expectedPrice')}
                  size="small"
                  slotProps={{ htmlInput: { min: 0, step: '0.01' }, input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                />
              </>
            )}
            <TextField
              required
              label="Complaint details"
              placeholder={isPrice ? 'e.g. Customer was charged more than MRP printed on the strip' : 'e.g. Fever not reducing after 3 days of use'}
              value={form.complaintText}
              onChange={set('complaintText')}
              multiline
              minRows={3}
              maxRows={8}
              slotProps={{ htmlInput: { maxLength: TEXT_MAX } }}
              helperText={`${form.complaintText.length}/${TEXT_MAX}`}
              sx={{ gridColumn: '1 / -1' }}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={onClose} disabled={saving} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
            sx={{ fontWeight: 800, borderRadius: '10px' }}
          >
            {isEdit ? 'Save changes' : 'Send complaint'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ComplaintFormDialog;
