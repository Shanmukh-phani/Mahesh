import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';
import { AlertTriangle } from 'lucide-react';
import { dialogPaperSx } from './admin/AdminChrome';

const ConfirmDialog = ({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
  loading = false
}) => (
  <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }}>
    <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#FEE2E2', color: '#B91C1C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={20} />
        </Box>
        {title}
      </Box>
    </DialogTitle>
    <DialogContent>
      <Typography sx={{ color: '#64748B', fontSize: '0.9rem', lineHeight: 1.55 }}>
        {message}
      </Typography>
    </DialogContent>
    <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
      <Button onClick={onCancel} disabled={loading} sx={{ fontWeight: 700, color: '#64748B' }}>
        {cancelLabel}
      </Button>
      <Button
        variant="contained"
        color="error"
        disabled={loading}
        onClick={onConfirm}
        sx={{ fontWeight: 800 }}
      >
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);

export default ConfirmDialog;
