import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, 
  Card, Chip, Button, IconButton, Divider 
} from '@mui/material';
import { 
  FileText, Store, User, Clock, CheckCircle2, 
  X, Package, AlertTriangle, MessageSquare 
} from 'lucide-react';
import { format } from 'date-fns';

const PALETTES = {
  ADMIN: {
    iconBg: '#DBEAFE', iconColor: '#1D4ED8', accent: '#0D9488', strong: '#2563EB',
    panelBg: '#EFF6FF', panelBorder: '#BFDBFE', panelIcon: '#1D4ED8', panelTitle: '#1E3A8A',
    panelChipBg: '#DBEAFE', panelChipColor: '#1E40AF', panelBoxBorder: '#93C5FD', panelDate: '#1D4ED8'
  },
  MINI_STORE: {
    iconBg: '#FFEDD5', iconColor: '#C2410C', accent: '#EA580C', strong: '#C2410C',
    panelBg: '#FFF7ED', panelBorder: '#FED7AA', panelIcon: '#C2410C', panelTitle: '#7C2D12',
    panelChipBg: '#FFEDD5', panelChipColor: '#9A3412', panelBoxBorder: '#FDBA74', panelDate: '#C2410C'
  }
};

const Row = ({ label, children }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
    <Box sx={{ textAlign: 'right', minWidth: 0, wordBreak: 'break-word' }}>{children}</Box>
  </Box>
);

const RequestDetailsModal = ({ open, onClose, request, onUpdateStatus, userRole = 'ADMIN' }) => {
  if (!request) return null;

  const p = PALETTES[userRole] || PALETTES.ADMIN;

  const formattedDate = request.createdAt ? format(new Date(request.createdAt), 'dd MMMM yyyy, h:mm a') : 'System Date';
  const expectedDateFormatted = request.expectedDate ? format(new Date(request.expectedDate), 'dd MMMM yyyy') : null;

  const storeCodeDisplay = request.storeCode || request.storeId?.storeCode || 'AP20';
  const storeNameDisplay = request.storeId?.storeName || 'Mini Store Branch';
  const employeeNameDisplay = request.employeeName || 'Logged-in Store Staff';
  const productNameDisplay = request.productName || request.medicineName || 'N/A';
  const compositionDisplay = request.composition || 'Standard formula';
  const mainBranchResponseDisplay = request.mainBranchResponse || request.adminNotes || 'No main branch response provided yet.';
  const commentsDisplay = request.comments || 'No employee comments added.';

  const sectionSx = { p: { xs: 2, sm: 2.5 }, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', height: '100%' };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth 
      PaperProps={{ 
        sx: { 
          borderRadius: { xs: '16px', sm: '20px' }, 
          p: { xs: 0, sm: 1 }, 
          m: { xs: 1.5, sm: 4 },
          width: { xs: 'calc(100% - 24px)', sm: undefined },
          bgcolor: '#FFFFFF',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)' 
        } 
      }}
    >
      {/* Title Header */}
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ p: 1.5, bgcolor: p.iconBg, borderRadius: '14px', color: p.iconColor, display: { xs: 'none', sm: 'flex' } }}>
              <FileText size={24} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography fontWeight="800" color="#0F172A" sx={{ fontSize: { xs: '1.1rem', sm: '1.4rem' } }}>Requisition {request.requestId}</Typography>
                <Chip 
                  label={request.status || 'Pending'} 
                  size="small" 
                  className={`badge-chip status-${(request.status || 'pending').toLowerCase().replace(/[^a-z]/g, '')}`} 
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3, fontWeight: 600 }}>
                <Clock size={12} color={p.accent} /> Auto System Date: {formattedDate}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose} sx={{ color: '#64748B', '&:hover': { bgcolor: '#F1F5F9' } }}>
            <X size={20} />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider sx={{ my: 1 }} />

      {/* Content Body */}
      <DialogContent sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          {/* Section 1: Product & Composition */}
          <Card sx={sectionSx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Package size={20} color={p.accent} />
              <Typography variant="subtitle1" fontWeight="800" color="#0F172A">Product Information</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Row label="Product Name:">
                <Typography variant="body2" fontWeight="800" color="#0F172A">{productNameDisplay}</Typography>
              </Row>
              <Row label="Composition:">
                <Typography variant="body2" fontWeight="700" color={p.accent}>{compositionDisplay}</Typography>
              </Row>
              <Row label="Quantity Required:">
                <Typography variant="body2" fontWeight="800" color={p.strong}>{request.quantity} Units</Typography>
              </Row>
            </Box>
          </Card>

          {/* Section 2: Store Code & Logged Employee */}
          <Card sx={sectionSx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Store size={20} color={p.strong} />
              <Typography variant="subtitle1" fontWeight="800" color="#0F172A">Store & Employee Context (Auto)</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Row label="Store ID:">
                <Typography variant="body2" fontWeight="800" color={p.strong}>{storeCodeDisplay} ({storeNameDisplay})</Typography>
              </Row>
              <Row label="Logged Employee Name:">
                <Typography variant="body2" fontWeight="800" color="#0F172A">{employeeNameDisplay}</Typography>
              </Row>
              <Row label="System Timestamp:">
                <Typography variant="body2" fontWeight="600" color="#64748B">{formattedDate}</Typography>
              </Row>
            </Box>
          </Card>

          {/* Section 3: Customer Details */}
          <Card sx={sectionSx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <User size={20} color="#8B5CF6" />
              <Typography variant="subtitle1" fontWeight="800" color="#0F172A">Customer Details</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Row label="Customer Name:">
                <Typography variant="body2" fontWeight="800" color="#0F172A">{request.customer?.name || 'Anonymous'}</Typography>
              </Row>
              <Row label="Customer Phone:">
                <Typography variant="body2" fontWeight="800" color={p.strong}>{request.customer?.phone || 'N/A'}</Typography>
              </Row>
              <Row label="Customer Address:">
                <Typography variant="body2" fontWeight="600" color="#0F172A">{request.customer?.address || 'N/A'}</Typography>
              </Row>
            </Box>
          </Card>

          {/* Section 4: Employee Comments */}
          <Card sx={sectionSx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <MessageSquare size={20} color="#64748B" />
              <Typography variant="subtitle1" fontWeight="800" color="#0F172A">Requisition Comments</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" mb={0.5}>Employee / Store Comments:</Typography>
            <Typography variant="body2" fontWeight="600" color="#334155" sx={{ p: 1.5, bgcolor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', minHeight: 60, wordBreak: 'break-word' }}>
              {commentsDisplay}
            </Typography>
          </Card>

          {/* Section 5: Response from Main Branch & Status Control */}
          <Card sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '16px', bgcolor: p.panelBg, border: `1px solid ${p.panelBorder}`, gridColumn: { md: '1 / -1' } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <AlertTriangle size={20} color={p.panelIcon} />
                <Typography variant="subtitle1" fontWeight="800" color={p.panelTitle}>Response from Main Branch (Admin Controlled)</Typography>
              </Box>
              <Chip 
                label={`Status: ${request.status || 'Pending'}`} 
                sx={{ bgcolor: p.panelChipBg, color: p.panelChipColor, fontWeight: 800 }} 
              />
            </Box>
            
            <Typography variant="body2" color={p.panelTitle} fontWeight="600" sx={{ p: 1.8, bgcolor: '#FFFFFF', borderRadius: '10px', border: `1px solid ${p.panelBoxBorder}`, wordBreak: 'break-word' }}>
              {mainBranchResponseDisplay}
            </Typography>

            {expectedDateFormatted && (
              <Typography variant="caption" color={p.panelDate} sx={{ display: 'block', mt: 1, fontWeight: 700 }}>
                Expected Delivery Date: {expectedDateFormatted}
              </Typography>
            )}
          </Card>
        </Box>
      </DialogContent>

      <Divider sx={{ my: 1 }} />

      {/* Footer Actions */}
      <DialogActions sx={{ p: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748B', fontWeight: 700, px: 2 }}>
          Close Details
        </Button>

        {userRole === 'ADMIN' && onUpdateStatus && (
          <Button 
            variant="contained" 
            startIcon={<CheckCircle2 size={18} />} 
            onClick={() => {
              onClose();
              onUpdateStatus(request);
            }}
            sx={{ borderRadius: '12px', fontWeight: 800, px: 3, py: 1.2 }}
          >
            Update Response & Status
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RequestDetailsModal;
