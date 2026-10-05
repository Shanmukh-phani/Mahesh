import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Box, TextField, Button, Typography } from '@mui/material';
import toast from 'react-hot-toast';
import api from '../services/api';

const empty = { currentPassword: '', newPassword: '', confirm: '' };

const ChangePasswordDialog = ({ open, onClose, color = 'primary' }) => {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const error = !form.currentPassword
    ? 'Enter your current password'
    : form.newPassword.length < 6
      ? 'New password must be at least 6 characters'
      : form.newPassword !== form.confirm
        ? 'Passwords do not match'
        : '';

  const close = () => {
    if (saving) return;
    setForm(empty);
    setTried(false);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (error) return;
    setSaving(true);
    try {
      await api.put('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password changed');
      setSaving(false);
      setForm(empty);
      setTried(false);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change password');
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px', m: { xs: 1.5, sm: 2 }, width: { xs: 'calc(100% - 24px)', sm: '100%' } } }}>
      <form onSubmit={submit}>
        <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Change password</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#64748B', fontSize: '0.82rem', mb: 2 }}>This only changes your own login.</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField type="password" label="Current password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} fullWidth autoFocus />
            <TextField type="password" label="New password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} fullWidth />
            <TextField
              type="password"
              label="Confirm new password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              fullWidth
              error={tried && Boolean(error)}
              helperText={tried ? error : ''}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={close} sx={{ color: 'text.secondary', fontWeight: 700 }}>Cancel</Button>
          <Button type="submit" variant="contained" color={color} disabled={saving} sx={{ fontWeight: 800 }}>
            {saving ? 'Saving...' : 'Update password'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ChangePasswordDialog;
