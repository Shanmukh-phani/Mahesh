import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Chip, Button, CircularProgress 
} from '@mui/material';
import { FileText, PlusCircle, RefreshCw, User, MessageSquare, MessageCircleReply } from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import socket from '../../services/socket';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { findRequestFromParams } from '../../utils/notificationLinks';

import RequestDetailsModal from '../../components/RequestDetailsModal';
import { adminHasResponded } from '../../components/StoreResponsePanel';
import { ApprovalChip } from '../../components/ApprovalTrail';
import { PageHeader, EmptyState, statusChipClass } from '../../components/admin/AdminChrome';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const clampSx = { overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Available at Main Branch', label: 'Available' },
  { value: 'Approved / Will Be Supplied', label: 'Approved' },
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
  { value: 'name', label: 'Medicine: A to Z' }
];

const StoreRequestsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [quick, setQuick] = useState('ALL');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Details Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedReqForDetails, setSelectedReqForDetails] = useState(null);
  const navigate = useNavigate();

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests');
      setRequests(res.data);
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchRequests);

  useEffect(() => {
    fetchRequests();

    const patch = (r, data) => ({
      ...r,
      status: data.status,
      adminNotes: data.adminNotes ?? r.adminNotes,
      mainBranchResponse: data.mainBranchResponse ?? r.mainBranchResponse,
      approvalStage: data.approvalStage ?? r.approvalStage,
      executiveReview: data.executiveReview ?? r.executiveReview,
      lastUpdatedBy: data.lastUpdatedBy ?? r.lastUpdatedBy
    });
    const handleRequestUpdated = (data) => {
      setRequests(prev => prev.map(r => r._id === data._id ? patch(r, data) : r));
      setSelectedReqForDetails(prev => (prev && prev._id === data._id ? patch(prev, data) : prev));
    };

    socket.on('medicine_request_updated', handleRequestUpdated);

    return () => {
      socket.off('medicine_request_updated', handleRequestUpdated);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const { wanted, request } = findRequestFromParams(requests, searchParams);
    if (!wanted) return;
    if (request) {
      setSelectedReqForDetails(request);
      setDetailsModalOpen(true);
    } else {
      toast.error('That request could not be found');
    }
    setSearchParams({}, { replace: true });
  }, [loading, requests, searchParams]);

  const filteredRequests = requests.filter(req => {
    const term = search.toLowerCase();
    const matchesSearch = 
      req.requestId?.toLowerCase().includes(term) ||
      req.medicineName?.toLowerCase().includes(term) ||
      req.productName?.toLowerCase().includes(term) ||
      req.customer?.name?.toLowerCase().includes(term) ||
      req.customer?.phone?.includes(term);

    const matchesStatus = statusFilter ? req.status === statusFilter : true;
    return matchesSearch && matchesStatus && QUICK_GROUPS[quick](req.status) && inDateRange(req.createdAt, dateRange);
  }).sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortBy === 'qty') return Number(b.quantity || 0) - Number(a.quantity || 0);
    if (sortBy === 'name') return String(a.productName || a.medicineName || '').localeCompare(String(b.productName || b.medicineName || ''));
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const paged = usePagedList(filteredRequests, 10, `${search}|${statusFilter}|${quick}|${dateRange}|${sortBy}`);

  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const inProgressCount = requests.filter(r => IN_PROGRESS.includes(r.status)).length;
  const completedCount = requests.filter(r => r.status === 'Completed').length;
  const closedCount = requests.filter(r => CLOSED.includes(r.status)).length;

  const openDetails = (req) => {
    setSelectedReqForDetails(req);
    setDetailsModalOpen(true);
  };

  const responseText = (req) => req.mainBranchResponse || req.adminNotes;

  const handleStoreResponseSaved = (updated) => {
    setRequests(prev => prev.map(r => (r._id === updated._id ? { ...r, ...updated } : r)));
    setSelectedReqForDetails(prev => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
  };

  const storeUpdateAction = (req) => {
    if (!adminHasResponded(req)) return null;
    return (
      <Button
        size="small"
        variant={req.storeResponse ? 'text' : 'outlined'}
        startIcon={<MessageCircleReply size={14} />}
        onClick={(e) => { e.stopPropagation(); openDetails(req); }}
        sx={{ borderRadius: '8px', fontWeight: 800, textTransform: 'none', color: ORANGE_DARK, borderColor: '#FDBA74', px: 1.25, minWidth: 0, whiteSpace: 'nowrap' }}
      >
        {req.storeResponse ? 'Edit update' : 'Add update'}
      </Button>
    );
  };

  const storeUpdateSnippet = (req) => (req.storeResponse ? (
    <Typography sx={{ fontSize: '0.74rem', color: '#7C2D12', fontWeight: 600, wordBreak: 'break-word', mt: 0.5 }}>
      <Box component="span" sx={{ fontWeight: 800 }}>Your update: </Box>{req.storeResponse}
      {req.storeResponseAt && (
        <Box component="span" sx={{ color: '#94A3B8', fontWeight: 600 }}> · {format(new Date(req.storeResponseAt), 'dd MMM, p')}</Box>
      )}
    </Typography>
  ) : null);

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<FileText size={26} />}
        title="My Store Requests"
        subtitle="History and live fulfillment tracking for warehouse medicine requisitions."
        actions={(
          <>
            <Button 
              variant="outlined" 
              startIcon={<RefreshCw size={18} />} 
              onClick={fetchRequests}
              sx={{ borderRadius: '12px', fontWeight: 800 }}
            >
              Refresh
            </Button>
            <Button 
              variant="contained" 
              color="secondary"
              startIcon={<PlusCircle size={18} />} 
              onClick={() => navigate('/store/create-request')}
              sx={{ borderRadius: '12px', px: 2.5, fontWeight: 800 }}
            >
              New Request
            </Button>
          </>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search request ID, medicine, customer, phone..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: requests.length },
              { value: 'PENDING', label: 'Pending', count: pendingCount },
              { value: 'PROGRESS', label: 'In progress', count: inProgressCount },
              { value: 'DONE', label: 'Completed', count: completedCount },
              { value: 'CLOSED', label: 'Closed', count: closedCount }
            ]}
            quickValue={quick}
            onQuickChange={setQuick}
            filters={[
              { key: 'status', label: 'Exact status', value: statusFilter, options: STATUS_FILTERS, onChange: setStatusFilter },
              { key: 'date', label: 'Requested', value: dateRange, options: DATE_RANGES, onChange: setDateRange }
            ]}
            sort={{ value: sortBy, options: SORTS, onChange: setSortBy }}
            resultCount={filteredRequests.length}
            resultLabel="requests"
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} /></Box>
        ) : filteredRequests.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No requests found" text={search || statusFilter || dateRange || quick !== 'ALL' ? 'Try a different search or filter.' : 'Create your first requisition to see it here.'} />
        ) : (
          <>
            {/* Mobile / tablet cards */}
            <Box sx={{ display: { xs: 'grid', lg: 'none' }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, p: 1.5, gap: 1.25 }}>
              {paged.visible.map((req) => (
                <Box
                  key={req._id}
                  onClick={() => openDetails(req)}
                  sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #F1F5F9', bgcolor: '#FFFFFF', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 0.9, transition: 'all 0.15s ease', '&:hover': { borderColor: '#FED7AA', bgcolor: '#FFF7ED' } }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: ORANGE, fontSize: '0.82rem' }}>{req.requestId}</Typography>
                    <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                  </Box>
                  <ApprovalChip request={req} sx={{ alignSelf: 'flex-start' }} />
                  <Box>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem', overflowWrap: 'anywhere' }}>
                      {req.productName || req.medicineName}
                      <Box component="span" sx={{ color: ORANGE_DARK, ml: 1, fontSize: '0.8rem' }}>× {req.quantity}</Box>
                    </Typography>
                    {req.composition && (
                      <Typography title={req.composition} sx={{ color: '#64748B', fontSize: '0.76rem', ...clampSx }}>{req.composition}</Typography>
                    )}
                  </Box>
                  <Typography sx={{ color: '#475569', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <User size={13} /> {req.customer?.name || 'Walk-in'}{req.customer?.phone ? ` · ${req.customer.phone}` : ''}
                  </Typography>
                  {responseText(req) && (
                    <Box sx={{ display: 'flex', gap: 0.75, p: 1, borderRadius: '10px', bgcolor: '#FFF7ED', color: '#9A3412' }}>
                      <MessageSquare size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, wordBreak: 'break-word' }}>{responseText(req)}</Typography>
                    </Box>
                  )}
                  {(req.storeResponse || adminHasResponded(req)) && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                      <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>{storeUpdateSnippet(req)}</Box>
                      {storeUpdateAction(req)}
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600 }}>
                      {req.storeCode || req.storeId?.storeCode || 'AP20'} · {req.employeeName || 'Store Staff'}
                    </Typography>
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600 }}>
                      {format(new Date(req.createdAt), 'dd MMM yyyy, p')}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Desktop table */}
            <TableContainer sx={{ display: { xs: 'none', lg: 'block' }, width: '100%', overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 3 }}>Request ID</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Product & Composition</TableCell>
                    <TableCell align="center">Qty</TableCell>
                    <TableCell>Employee & Store</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell sx={{ pr: 3 }}>Main Branch Response</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.visible.map((req) => (
                    <TableRow 
                      key={req._id} 
                      hover
                      onClick={() => openDetails(req)}
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FFF7ED !important' } }}
                    >
                      <TableCell sx={{ pl: 3, fontWeight: 800, color: ORANGE }}>{req.requestId}</TableCell>
                      <TableCell sx={{ color: '#475569', whiteSpace: 'nowrap' }}>{format(new Date(req.createdAt), 'dd MMM yyyy, p')}</TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>
                        <Typography variant="body2" fontWeight="800" color="#0F172A" sx={{ overflowWrap: 'anywhere' }}>{req.productName || req.medicineName}</Typography>
                        {req.composition && (
                          <Typography variant="caption" color="text.secondary" title={req.composition} sx={clampSx}>{req.composition}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Box component="span" sx={{ px: 1.25, py: 0.4, borderRadius: '8px', bgcolor: '#FFF7ED', color: ORANGE_DARK, fontWeight: 800, fontSize: '0.85rem' }}>
                          {req.quantity}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="700" color={ORANGE_DARK}>{req.storeCode || req.storeId?.storeCode || 'AP20'}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">{req.employeeName || 'Store Staff'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="700" color="#0F172A">{req.customer?.name}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">{req.customer?.phone}</Typography>
                        {req.customer?.address && (
                          <Typography variant="caption" color="text.secondary" display="block">{req.customer?.address}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                        <Box sx={{ mt: 0.5 }}><ApprovalChip request={req} short /></Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem', pr: 3, maxWidth: 260, color: '#475569' }}>
                        {responseText(req) || '—'}
                        {storeUpdateSnippet(req)}
                        <Box sx={{ mt: 0.75 }}>{storeUpdateAction(req)}</Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <ShowMoreFooter paged={paged} label="requests" />
          </>
        )}
      </Card>

      {/* Details View Modal */}
      <RequestDetailsModal 
        open={detailsModalOpen} 
        onClose={() => setDetailsModalOpen(false)} 
        request={selectedReqForDetails} 
        onRequestUpdated={handleStoreResponseSaved}
        userRole="MINI_STORE"
      />
    </Box>
  );
};

export default StoreRequestsPage;
