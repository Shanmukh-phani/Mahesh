import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';
import RequestDetailsModal from '../../components/RequestDetailsModal';
import NotificationContext from '../../components/NotificationContext';
import { ApprovalChip, LastUpdatedBy } from '../../components/ApprovalTrail';
import { findRequestFromParams } from '../../utils/notificationLinks';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, statusChipClass, dialogPaperSx, ChoiceChips } from '../../components/admin/AdminChrome';

const STAGES = {
  PENDING: (r) => r.approvalStage === 'PENDING_EXECUTIVE',
  APPROVED: (r) => !r.approvalStage || r.approvalStage === 'FORWARDED',
  REJECTED: (r) => r.approvalStage === 'REJECTED_BY_EXECUTIVE',
  ALL: () => true
};

const APPROVE_NOTES = ['Genuine customer need', 'Verified with store', 'Urgent, please prioritise'];
const REJECT_NOTES = ['Available in store stock', 'Duplicate request', 'Incomplete customer details', 'Quantity too high, please re-check'];

const clampSx = { overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

const requestTag = (req) => ({ requestCode: req?.requestId, storeCode: req?.storeCode || req?.storeId?.storeCode, storeName: req?.storeId?.storeName });

export const notifyExecutiveReviewed = () => window.dispatchEvent(new Event('medconnect:executive-reviewed'));

const ExecutiveApprovalsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('oldest');
  const [details, setDetails] = useState(null);
  const [review, setReview] = useState(null);
  const [decision, setDecision] = useState('approve');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [triedReview, setTriedReview] = useState(false);
  const detailsRef = useRef(null);
  detailsRef.current = details;

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests');
      setRequests(res.data || []);
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    api.get('/stores').then((res) => setStores(res.data || [])).catch(() => {});

    const handleCreated = (data) => {
      if (!data?._id) return;
      setRequests((prev) => (prev.some((r) => r._id === data._id) ? prev : [data, ...prev]));
    };
    const handleUpdated = (data) => {
      if (!data?._id) return;
      const merge = (r) => (r && r._id === data._id ? { ...r, ...data } : r);
      setRequests((prev) => prev.map(merge));
      setDetails(merge);
    };
    socket.on('medicine_request_created', handleCreated);
    socket.on('medicine_request_updated', handleUpdated);
    return () => {
      socket.off('medicine_request_created', handleCreated);
      socket.off('medicine_request_updated', handleUpdated);
    };
  }, []);

  const openReview = (req, nextDecision = 'approve') => {
    setReview(req);
    setDecision(nextDecision);
    setNote('');
    setTriedReview(false);
  };

  useEffect(() => {
    if (loading) return;
    const { wanted, request } = findRequestFromParams(requests, searchParams);
    if (!wanted) return;
    if (!request) toast.error('That request could not be found');
    else if (STAGES.PENDING(request)) openReview(request);
    else setDetails(request);
    setSearchParams({}, { replace: true });
  }, [loading, requests, searchParams]);

  const noteError = decision === 'reject' && !note.trim() ? 'Please give a reason for rejecting' : '';

  const submitReview = async (e) => {
    e.preventDefault();
    setTriedReview(true);
    if (noteError || !review) return;
    setSaving(true);
    try {
      const res = await api.put(`/requests/${review._id}/executive-review`, { decision, note: note.trim() });
      setRequests((prev) => prev.map((r) => (r._id === review._id ? { ...r, ...res.data } : r)));
      if (detailsRef.current?._id === review._id) setDetails((d) => ({ ...d, ...res.data }));
      toast.success(decision === 'approve' ? `${review.requestId} approved and sent to main branch` : `${review.requestId} rejected`);
      setReview(null);
      notifyExecutiveReviewed();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your review');
      if (err.response?.status === 400 || err.response?.status === 409) fetchRequests();
    } finally {
      setSaving(false);
    }
  };

  const counts = Object.fromEntries(Object.entries(STAGES).map(([k, fn]) => [k, requests.filter(fn).length]));

  const filtered = requests.filter((r) => {
    const term = search.trim().toLowerCase();
    const matches = !term || [r.requestId, r.productName, r.medicineName, r.composition, r.customer?.name, r.customer?.phone, r.employeeName, r.storeCode, r.storeId?.storeName]
      .some((v) => String(v || '').toLowerCase().includes(term));
    const storeOk = !storeFilter || String(r.storeId?._id || r.storeId) === storeFilter;
    return matches && storeOk && STAGES[stage](r) && inDateRange(r.createdAt, dateRange);
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === 'qty') return Number(b.quantity || 0) - Number(a.quantity || 0);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  const paged = usePagedList(filtered, 10, `${stage}|${search}|${storeFilter}|${dateRange}|${sortBy}`);

  const reviewButtons = (req, size = 'small') => (STAGES.PENDING(req) ? (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
      <Button size={size} variant="contained" color="success" startIcon={<CheckCircle2 size={14} />} onClick={(e) => { e.stopPropagation(); openReview(req, 'approve'); }} sx={{ fontWeight: 800, borderRadius: '8px' }}>
        Approve
      </Button>
      <Button size={size} variant="outlined" color="error" startIcon={<XCircle size={14} />} onClick={(e) => { e.stopPropagation(); openReview(req, 'reject'); }} sx={{ fontWeight: 800, borderRadius: '8px' }}>
        Reject
      </Button>
    </Box>
  ) : null);

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<ShieldCheck size={26} />}
        title="Request approvals"
        subtitle="Step 1 of 2: review requests from your stores. Approved requests go to the main branch."
        actions={(
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchRequests} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
            Refresh
          </Button>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', mb: { xs: 1.5, lg: 0 } }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search ID, medicine, customer, employee, store..."
            quickFilters={[
              { value: 'PENDING', label: 'Waiting for me', count: counts.PENDING },
              { value: 'APPROVED', label: 'Sent to main branch', count: counts.APPROVED },
              { value: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
              { value: 'ALL', label: 'All', count: counts.ALL }
            ]}
            quickValue={stage}
            onQuickChange={setStage}
            filters={[
              { key: 'store', label: 'Store', value: storeFilter, options: [{ value: '', label: 'All my stores' }, ...stores.map((s) => ({ value: s._id, label: `${s.storeCode} · ${s.storeName}` }))], onChange: setStoreFilter },
              { key: 'date', label: 'Requested', value: dateRange, options: DATE_RANGES, onChange: setDateRange }
            ]}
            sort={{ value: sortBy, onChange: setSortBy, options: [{ value: 'oldest', label: 'Oldest first' }, { value: 'newest', label: 'Newest first' }, { value: 'qty', label: 'Quantity: high to low' }] }}
            resultCount={filtered.length}
            resultLabel="requests"
          />
        </Box>

        <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={22} />} title={stage === 'PENDING' ? 'Nothing waiting for approval' : 'No requests found'} text="New requests from your stores appear here instantly." />
          ) : paged.visible.map((req) => (
            <Box key={req._id} onClick={() => setDetails(req)} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid', borderColor: STAGES.PENDING(req) ? '#FCD34D' : '#E2E8F0', bgcolor: STAGES.PENDING(req) ? '#FFFBEB' : '#F8FAFC', cursor: 'pointer' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <NotificationContext notif={{ requestCode: req.requestId }} sx={{ mt: 0, flexShrink: 0 }} />
                <Chip label={req.status} size="small" className={statusChipClass(req.status)} sx={{ minWidth: 0 }} />
              </Box>
              <NotificationContext notif={{ storeCode: requestTag(req).storeCode, storeName: requestTag(req).storeName }} sx={{ mt: 0.75, mb: 0.75 }} />
              <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{req.productName || req.medicineName}</Typography>
              {req.composition && <Typography title={req.composition} sx={{ color: '#64748B', fontSize: '0.74rem', ...clampSx }}>{req.composition}</Typography>}
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mt: 0.4 }}>
                Qty {req.quantity} · {req.customer?.name} · by {req.employeeName || 'Store Staff'}
              </Typography>
              <Typography sx={{ color: '#94A3B8', fontSize: '0.72rem', mt: 0.3 }}>{req.createdAt ? format(new Date(req.createdAt), 'dd MMM yyyy, p') : ''}</Typography>
              <ApprovalChip request={req} sx={{ mt: 0.75 }} />
              <LastUpdatedBy request={req} sx={{ mt: 0.4 }} />
              <Box sx={{ mt: 1.25 }}>{reviewButtons(req)}</Box>
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
                <TableCell>Raised by</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8}><EmptyState icon={<ShieldCheck size={22} />} title={stage === 'PENDING' ? 'Nothing waiting for approval' : 'No requests found'} text="New requests from your stores appear here instantly." /></TableCell></TableRow>
              ) : paged.visible.map((req) => (
                <TableRow key={req._id} hover onClick={() => setDetails(req)} sx={{ cursor: 'pointer', bgcolor: STAGES.PENDING(req) ? '#FFFBEB' : undefined }}>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <NotificationContext notif={requestTag(req)} sx={{ mt: 0, flexDirection: 'column', alignItems: 'flex-start' }} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{req.createdAt ? format(new Date(req.createdAt), 'dd MMM yyyy, p') : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{req.productName || req.medicineName}</Typography>
                    {req.composition && <Typography title={req.composition} sx={{ color: '#64748B', fontSize: '0.72rem', ...clampSx }}>{req.composition}</Typography>}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, color: 'primary.main' }}>{req.quantity}</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{req.employeeName || 'Store Staff'}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{req.customer?.name}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{req.customer?.phone}</Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                    <Box sx={{ mt: 0.5 }}><ApprovalChip request={req} short /></Box>
                    <LastUpdatedBy request={req} sx={{ mt: 0.4 }} />
                  </TableCell>
                  <TableCell align="right">{reviewButtons(req) || <Button size="small" onClick={(e) => { e.stopPropagation(); setDetails(req); }} sx={{ fontWeight: 800 }}>View</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && <ShowMoreFooter paged={paged} label="requests" />}
      </Card>

      <RequestDetailsModal
        open={Boolean(details)}
        onClose={() => setDetails(null)}
        request={details}
        userRole="EXECUTIVE"
        extraActions={details && STAGES.PENDING(details) ? (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" color="error" startIcon={<XCircle size={16} />} onClick={() => { const d = details; setDetails(null); openReview(d, 'reject'); }} sx={{ fontWeight: 800, borderRadius: '12px' }}>Reject</Button>
            <Button variant="contained" color="success" startIcon={<CheckCircle2 size={16} />} onClick={() => { const d = details; setDetails(null); openReview(d, 'approve'); }} sx={{ fontWeight: 800, borderRadius: '12px' }}>Approve & send</Button>
          </Box>
        ) : null}
      />

      <Dialog open={Boolean(review)} onClose={() => !saving && setReview(null)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={submitReview}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Review {review?.requestId}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <NotificationContext notif={requestTag(review)} sx={{ mt: 0 }} />
            <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{review?.productName || review?.medicineName} · Qty {review?.quantity}</Typography>
              {review?.composition && <Typography sx={{ color: '#64748B', fontSize: '0.78rem', overflowWrap: 'anywhere' }}>{review.composition}</Typography>}
              <Typography sx={{ color: '#475569', fontSize: '0.8rem', mt: 0.5 }}>
                Customer: {review?.customer?.name || 'Anonymous'}{review?.customer?.phone ? ` · ${review.customer.phone}` : ''}
              </Typography>
              <Typography sx={{ color: '#475569', fontSize: '0.8rem' }}>Raised by {review?.employeeName || 'Store Staff'}</Typography>
              {review?.comments && <Typography sx={{ color: '#334155', fontSize: '0.8rem', mt: 0.5, overflowWrap: 'anywhere' }}>"{review.comments}"</Typography>}
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>DECISION</Typography>
              <ChoiceChips
                options={[{ value: 'approve', label: 'Approve & send to main branch' }, { value: 'reject', label: 'Reject' }]}
                value={decision}
                onChange={(d) => { setDecision(d); setTriedReview(false); }}
                color={decision === 'reject' ? '#DC2626' : '#16A34A'}
              />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>QUICK NOTE</Typography>
              <ChoiceChips options={decision === 'reject' ? REJECT_NOTES : APPROVE_NOTES} value={note} onChange={setNote} />
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={decision === 'reject' ? 'Reason (required)' : 'Note for main branch (optional)'}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              error={triedReview && Boolean(noteError)}
              helperText={triedReview && noteError ? noteError : decision === 'reject' ? 'The store sees this reason' : 'The main branch and the store see this note'}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setReview(null)} disabled={saving} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" color={decision === 'reject' ? 'error' : 'success'} disabled={saving} sx={{ fontWeight: 800 }}>
              {saving ? 'Saving...' : decision === 'reject' ? 'Reject request' : 'Approve & send'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default ExecutiveApprovalsPage;
