import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, MenuItem, Select, FormControl, InputLabel,
  TextField, Button, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions
} from '@mui/material';
import { FileText, RefreshCw, Edit3, Clock, CheckCircle2 } from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import socket from '../../services/socket';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import RequestDetailsModal from '../../components/RequestDetailsModal';
import { findRequestFromParams } from '../../utils/notificationLinks';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, statusChipClass, dialogPaperSx, ChoiceChips } from '../../components/admin/AdminChrome';

const STATUSES = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved / Will Be Supplied', label: 'Approved' },
  { value: 'Available at Main Branch', label: 'Available' },
  { value: 'Ordered', label: 'Ordered' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Not Available', label: 'Not available' },
  { value: 'Rejected', label: 'Rejected' }
];

const IN_PROGRESS = ['Available at Main Branch', 'Approved / Will Be Supplied', 'Ordered'];
const CLOSED = ['Not Available', 'Rejected'];
const QUICK_GROUPS = {
  ALL: () => true,
  PENDING: (s) => s === 'Pending',
  PROGRESS: (s) => IN_PROGRESS.includes(s),
  DONE: (s) => s === 'Completed',
  CLOSED: (s) => CLOSED.includes(s)
};
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'qty', label: 'Quantity: high to low' },
  { value: 'store', label: 'Store ID' }
];

const NOTE_TEMPLATES = [
  { label: 'Will dispatch today', text: 'Approved. Stock allocated and will be dispatched today.' },
  { label: 'Available at main', text: 'Available at Main Branch. Please collect or wait for transfer.' },
  { label: 'Ordered from supplier', text: 'Not in warehouse stock. Ordered from supplier.' },
  { label: 'Not available', text: 'This medicine is currently not available.' }
];

const MedicineRequests = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [quick, setQuick] = useState('ALL');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedReqForDetails, setSelectedReqForDetails] = useState(null);
  const [selectedReq, setSelectedReq] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    status: 'Pending',
    adminNotes: '',
    expectedDate: ''
  });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests');
      setRequests(res.data);
    } catch (error) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await api.get('/stores');
      setStores(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useAIRefresh(fetchRequests);

  useEffect(() => {
    fetchRequests();
    fetchStores();

    const handleRequestCreated = (data) => {
      setRequests((prev) => (prev.some((r) => r._id === data._id) ? prev : [data, ...prev]));
      toast.success(`New request ${data.requestId} from ${data.storeId?.storeName || 'Store'}`);
    };

    socket.on('medicine_request_created', handleRequestCreated);

    return () => {
      socket.off('medicine_request_created', handleRequestCreated);
    };
  }, []);

  const handleOpenUpdateModal = (req) => {
    setSelectedReq(req);
    setUpdateForm({
      status: req.status || 'Pending',
      adminNotes: req.adminNotes || '',
      expectedDate: req.expectedDate ? new Date(req.expectedDate).toISOString().substring(0, 10) : ''
    });
    setOpenModal(true);
  };

  useEffect(() => {
    if (loading) return;
    const { wanted, request } = findRequestFromParams(requests, searchParams);
    if (!wanted) return;
    if (request) {
      handleOpenUpdateModal(request);
    } else {
      toast.error('That request could not be found');
    }
    setSearchParams({}, { replace: true });
  }, [loading, requests, searchParams]);

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/requests/${selectedReq._id}/status`, updateForm);
      toast.success(`Request ${selectedReq.requestId} updated to ${updateForm.status}`);
      setRequests((prev) => prev.map((r) => (r._id === selectedReq._id ? { ...r, ...updateForm } : r)));
      setOpenModal(false);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const filteredRequests = requests.filter((req) => {
    const term = search.toLowerCase();
    const matchesSearch =
      req.requestId?.toLowerCase().includes(term) ||
      req.medicineName?.toLowerCase().includes(term) ||
      req.productName?.toLowerCase().includes(term) ||
      req.customer?.name?.toLowerCase().includes(term) ||
      req.customer?.phone?.includes(term) ||
      req.storeId?.storeName?.toLowerCase().includes(term);

    const matchesStatus = statusFilter ? req.status === statusFilter : true;
    const matchesStore = storeFilter ? req.storeId?._id === storeFilter : true;
    return matchesSearch && matchesStatus && matchesStore && QUICK_GROUPS[quick](req.status) && inDateRange(req.createdAt, dateRange);
  }).sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortBy === 'qty') return Number(b.quantity || 0) - Number(a.quantity || 0);
    if (sortBy === 'store') return String(a.storeCode || a.storeId?.storeCode || '').localeCompare(String(b.storeCode || b.storeId?.storeCode || ''));
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const paged = usePagedList(filteredRequests, 10, `${search}|${statusFilter}|${storeFilter}|${quick}|${dateRange}|${sortBy}`);

  const pendingCount = requests.filter((r) => r.status === 'Pending').length;
  const completedCount = requests.filter((r) => r.status === 'Completed').length;
  const inProgressCount = requests.filter((r) => IN_PROGRESS.includes(r.status)).length;
  const closedCount = requests.filter((r) => CLOSED.includes(r.status)).length;

  const openDetails = (req) => {
    setSelectedReqForDetails(req);
    setDetailsModalOpen(true);
  };

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<FileText size={26} />}
        title="Medicine requests"
        subtitle="Review branch requisitions, update fulfillment status, and send main-branch notes."
        actions={
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchRequests} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
            Refresh
          </Button>
        }
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', mb: { xs: 1.5, lg: 0 } }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search ID, medicine, customer, phone, store..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: requests.length },
              { value: 'PENDING', label: 'Needs action', count: pendingCount },
              { value: 'PROGRESS', label: 'In progress', count: inProgressCount },
              { value: 'DONE', label: 'Completed', count: completedCount },
              { value: 'CLOSED', label: 'Closed', count: closedCount }
            ]}
            quickValue={quick}
            onQuickChange={setQuick}
            filters={[
              { key: 'status', label: 'Exact status', value: statusFilter, options: [{ value: '', label: 'Any status' }, ...STATUSES], onChange: setStatusFilter },
              { key: 'store', label: 'Mini store', value: storeFilter, options: [{ value: '', label: 'All branches' }, ...stores.map((st) => ({ value: st._id, label: st.storeCode || st.storeName }))], onChange: setStoreFilter },
              { key: 'date', label: 'Requested', value: dateRange, options: DATE_RANGES, onChange: setDateRange }
            ]}
            sort={{ value: sortBy, options: SORTS, onChange: setSortBy }}
            resultCount={filteredRequests.length}
            resultLabel="requests"
          />
        </Box>

        <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : filteredRequests.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="No requests found" text="Try another filter, or wait for a mini store to submit a requisition." />
          ) : paged.visible.map((req) => (
            <Box key={req._id} onClick={() => openDetails(req)} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC', cursor: 'pointer' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontWeight: 800, color: '#0F766E', fontSize: '0.82rem' }}>{req.requestId}</Typography>
                <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
              </Box>
              <Typography sx={{ fontWeight: 800 }}>{req.productName || req.medicineName}</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mt: 0.4 }}>
                {req.storeCode || req.storeId?.storeCode} · Qty {req.quantity} · {req.customer?.name}
              </Typography>
              <Button size="small" startIcon={<Edit3 size={14} />} onClick={(e) => { e.stopPropagation(); handleOpenUpdateModal(req); }} sx={{ mt: 1.2, fontWeight: 800 }}>
                Update
              </Button>
            </Box>
          ))}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', lg: 'block' }, overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Request</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Product</TableCell>
                <TableCell align="center">Qty</TableCell>
                <TableCell>Store / staff</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell>Response</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
              ) : filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState icon={<FileText size={22} />} title="No requests found" text="Try another filter, or wait for a mini store to submit a requisition." />
                  </TableCell>
                </TableRow>
              ) : paged.visible.map((req) => (
                <TableRow key={req._id} hover onClick={() => openDetails(req)} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ fontWeight: 800, color: '#0F766E' }}>{req.requestId}</TableCell>
                  <TableCell>{req.createdAt ? format(new Date(req.createdAt), 'dd MMM yyyy, p') : '—'}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>{req.productName || req.medicineName}</Typography>
                    {req.composition && <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{req.composition}</Typography>}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, color: '#0D9488' }}>{req.quantity}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, color: '#0F766E', fontSize: '0.85rem' }}>{req.storeCode || req.storeId?.storeCode || 'AP20'}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{req.employeeName || 'Store Staff'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{req.customer?.name}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{req.customer?.phone}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                  </TableCell>
                  <TableCell sx={{ color: '#64748B', fontSize: '0.82rem', maxWidth: 180 }}>
                    {req.mainBranchResponse || req.adminNotes || '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" startIcon={<Edit3 size={14} />} onClick={(e) => { e.stopPropagation(); handleOpenUpdateModal(req); }} sx={{ borderRadius: '8px', fontWeight: 800 }}>
                      Update
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && <ShowMoreFooter paged={paged} label="requests" />}
      </Card>

      <RequestDetailsModal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        request={selectedReqForDetails}
        onUpdateStatus={(req) => handleOpenUpdateModal(req)}
        userRole="ADMIN"
      />

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleUpdateSubmit}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Update {selectedReq?.requestId}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography sx={{ color: '#64748B', fontSize: '0.85rem' }}>
              {selectedReq?.productName || selectedReq?.medicineName} · Qty {selectedReq?.quantity} · {selectedReq?.storeCode || selectedReq?.storeId?.storeCode}
            </Typography>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>STATUS</Typography>
              <ChoiceChips options={STATUSES} value={updateForm.status} onChange={(status) => setUpdateForm({ ...updateForm, status })} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>QUICK NOTE</Typography>
              <ChoiceChips
                options={NOTE_TEMPLATES.map((t) => ({ value: t.text, label: t.label }))}
                value={updateForm.adminNotes}
                onChange={(text) => setUpdateForm({ ...updateForm, adminNotes: text, mainBranchResponse: text })}
              />
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Response (optional)"
              placeholder="Tap a quick note or type your own..."
              value={updateForm.adminNotes}
              onChange={(e) => setUpdateForm({ ...updateForm, adminNotes: e.target.value, mainBranchResponse: e.target.value })}
            />
            <TextField
              fullWidth
              type="date"
              label="Expected date (optional)"
              value={updateForm.expectedDate}
              onChange={(e) => setUpdateForm({ ...updateForm, expectedDate: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ fontWeight: 800 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default MedicineRequests;
