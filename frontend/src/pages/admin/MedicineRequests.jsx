import React, { useEffect, useRef, useState } from 'react';
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
import StoreResponsePanel from '../../components/StoreResponsePanel';
import NotificationContext from '../../components/NotificationContext';
import { findRequestFromParams } from '../../utils/notificationLinks';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, statusChipClass, dialogPaperSx, ChoiceChips } from '../../components/admin/AdminChrome';
import { ApprovalChip, LastUpdatedBy } from '../../components/ApprovalTrail';

const VIEWS = [
  { value: 'inbox', label: 'Main branch inbox' },
  { value: 'executive', label: 'Waiting at executives' }
];

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

const clampSx = { overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

const requestTag = (req) => ({
  requestCode: req?.requestId,
  storeCode: req?.storeCode || req?.storeId?.storeCode,
  storeName: req?.storeId?.storeName
});

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

  const [view, setView] = useState('inbox');
  const viewRef = useRef('inbox');
  const readOnly = view === 'executive';

  const fetchRequests = async (nextView = viewRef.current) => {
    setLoading(true);
    try {
      const res = await api.get(nextView === 'executive' ? '/requests?stage=executive' : '/requests');
      if (nextView !== viewRef.current) return;
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

  useAIRefresh(() => fetchRequests());

  const changeView = (next) => {
    if (next === viewRef.current) return;
    viewRef.current = next;
    setView(next);
    setRequests([]);
    fetchRequests(next);
  };

  useEffect(() => {
    fetchRequests();
    fetchStores();

    const handleRequestCreated = (data) => {
      if (viewRef.current === 'executive') {
        setRequests((prev) => prev.filter((r) => r._id !== data._id));
      } else {
        setRequests((prev) => (prev.some((r) => r._id === data._id) ? prev : [data, ...prev]));
      }
      toast.success(`New request ${data.requestId} from ${data.storeId?.storeName || 'Store'}`);
    };

    const handleRequestUpdated = (data) => {
      if (!data?._id) return;
      const merge = (r) => (r && r._id === data._id ? { ...r, ...data } : r);
      setRequests((prev) => prev.map(merge));
      setSelectedReqForDetails(merge);
      setSelectedReq(merge);
    };

    socket.on('medicine_request_created', handleRequestCreated);
    socket.on('medicine_request_updated', handleRequestUpdated);

    return () => {
      socket.off('medicine_request_created', handleRequestCreated);
      socket.off('medicine_request_updated', handleRequestUpdated);
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
      const res = await api.put(`/requests/${selectedReq._id}/status`, updateForm);
      toast.success(`Request ${selectedReq.requestId} updated to ${updateForm.status}`);
      const saved = res.data && res.data._id ? res.data : updateForm;
      setRequests((prev) => prev.map((r) => (r._id === selectedReq._id ? { ...r, ...saved } : r)));
      setSelectedReqForDetails((r) => (r && r._id === selectedReq._id ? { ...r, ...saved } : r));
      setOpenModal(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update status');
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
      req.storeId?.storeName?.toLowerCase().includes(term) ||
      req.employeeName?.toLowerCase().includes(term) ||
      req.lastUpdatedBy?.toLowerCase().includes(term);

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

  const storeReplySnippet = (req) => (req.storeResponse ? (
    <Box sx={{ mt: 0.75, p: 0.9, borderRadius: '8px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
      <Typography sx={{ fontSize: '0.72rem', color: '#7C2D12', fontWeight: 600, wordBreak: 'break-word' }}>
        <Box component="span" sx={{ fontWeight: 800 }}>Store update: </Box>{req.storeResponse}
      </Typography>
      <Typography sx={{ fontSize: '0.66rem', color: '#9A3412', fontWeight: 600, opacity: 0.8 }}>
        {req.storeResponseBy || 'Store Staff'}{req.storeResponseAt ? ` · ${format(new Date(req.storeResponseAt), 'dd MMM, p')}` : ''}
      </Typography>
    </Box>
  ) : null);

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<FileText size={26} />}
        title="Medicine requests"
        subtitle="Review branch requisitions, update fulfillment status, and send main-branch notes."
        actions={
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => fetchRequests()} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
            Refresh
          </Button>
        }
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', mb: { xs: 1.5, lg: 0 } }}>
          <Box sx={{ mb: 1.75 }}>
            <ChoiceChips options={VIEWS} value={view} onChange={changeView} />
            {readOnly && (
              <Typography sx={{ color: '#92400E', bgcolor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', px: 1.25, py: 0.75, mt: 1.25, fontSize: '0.78rem', fontWeight: 700 }}>
                View only. These requests are still with the store's executive officer. They move to the inbox once approved.
              </Typography>
            )}
          </Box>
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <NotificationContext notif={{ requestCode: req.requestId }} sx={{ mt: 0, flexShrink: 0 }} />
                <Chip label={req.status} size="small" className={statusChipClass(req.status)} sx={{ minWidth: 0 }} />
              </Box>
              <NotificationContext notif={{ storeCode: requestTag(req).storeCode, storeName: requestTag(req).storeName }} sx={{ mt: 0.75, mb: 0.75 }} />
              <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{req.productName || req.medicineName}</Typography>
              {req.composition && <Typography title={req.composition} sx={{ color: '#64748B', fontSize: '0.74rem', ...clampSx }}>{req.composition}</Typography>}
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mt: 0.4 }}>
                Qty {req.quantity} · {req.customer?.name} · {req.employeeName || 'Store Staff'}
              </Typography>
              <ApprovalChip request={req} sx={{ mt: 0.75 }} />
              <LastUpdatedBy request={req} sx={{ mt: 0.5 }} />
              {storeReplySnippet(req)}
              {!readOnly && (
                <Button size="small" startIcon={<Edit3 size={14} />} onClick={(e) => { e.stopPropagation(); handleOpenUpdateModal(req); }} sx={{ mt: 1.2, fontWeight: 800 }}>
                  Update
                </Button>
              )}
            </Box>
          ))}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', lg: 'block' }, overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Request / store</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Product</TableCell>
                <TableCell align="center">Qty</TableCell>
                <TableCell>Staff</TableCell>
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
                  <TableCell sx={{ maxWidth: 220 }}>
                    <NotificationContext notif={requestTag(req)} sx={{ mt: 0, flexDirection: 'column', alignItems: 'flex-start' }} />
                  </TableCell>
                  <TableCell>{req.createdAt ? format(new Date(req.createdAt), 'dd MMM yyyy, p') : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{req.productName || req.medicineName}</Typography>
                    {req.composition && <Typography title={req.composition} sx={{ color: '#64748B', fontSize: '0.72rem', ...clampSx }}>{req.composition}</Typography>}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, color: '#0D9488' }}>{req.quantity}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{req.employeeName || 'Store Staff'}</Typography>
                    <ApprovalChip request={req} short sx={{ mt: 0.5 }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{req.customer?.name}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{req.customer?.phone}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                  </TableCell>
                  <TableCell sx={{ color: '#64748B', fontSize: '0.82rem', maxWidth: 240 }}>
                    {req.mainBranchResponse || req.adminNotes || '—'}
                    <LastUpdatedBy request={req} sx={{ mt: 0.4 }} />
                    {storeReplySnippet(req)}
                  </TableCell>
                  <TableCell align="right">
                    {readOnly ? (
                      <Button size="small" variant="text" onClick={(e) => { e.stopPropagation(); openDetails(req); }} sx={{ borderRadius: '8px', fontWeight: 800 }}>
                        View
                      </Button>
                    ) : (
                      <Button size="small" variant="outlined" startIcon={<Edit3 size={14} />} onClick={(e) => { e.stopPropagation(); handleOpenUpdateModal(req); }} sx={{ borderRadius: '8px', fontWeight: 800 }}>
                        Update
                      </Button>
                    )}
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
        onUpdateStatus={readOnly ? undefined : (req) => handleOpenUpdateModal(req)}
        userRole="ADMIN"
      />

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleUpdateSubmit}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Update {selectedReq?.requestId}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <NotificationContext notif={requestTag(selectedReq)} sx={{ mt: 0 }} />
            {selectedReq?.executiveReview?.decision && (
              <Box sx={{ p: 1.25, borderRadius: '10px', bgcolor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                <ApprovalChip request={selectedReq} />
                {selectedReq.executiveReview.note && (
                  <Typography sx={{ fontSize: '0.8rem', color: '#4C1D95', mt: 0.75, overflowWrap: 'anywhere' }}>"{selectedReq.executiveReview.note}"</Typography>
                )}
              </Box>
            )}
            <Typography sx={{ color: '#64748B', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
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
            {selectedReq && <StoreResponsePanel request={selectedReq} role="ADMIN" compact />}
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
