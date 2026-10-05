import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Box, Typography, Card, Chip, Button, CircularProgress } from '@mui/material';
import { Megaphone, Download, RefreshCw, Clock, CalendarDays, MessageCircleReply, Inbox, Hourglass, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { AuthContext } from '../../context/AuthContext';
import socket from '../../services/socket';
import useAIRefresh from '../../utils/useAIRefresh';
import { downloadExcel, excelDate, excelDay } from '../../utils/exportExcel';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, StatCard, statusChipClass } from '../../components/admin/AdminChrome';
import RequestDetailsModal from '../../components/RequestDetailsModal';
import { adminHasResponded } from '../../components/StoreResponsePanel';

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const STATUSES = [
  'Pending', 'Available at Main Branch', 'Approved / Will Be Supplied', 'Ordered', 'Completed', 'Not Available', 'Rejected'
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'request', label: 'Request ID' }
];

const adminUpdatesOf = (req) => {
  let history = req.mainBranchResponseHistory || [];
  if (!history.length && adminHasResponded(req)) {
    history = [{
      status: req.status,
      message: req.mainBranchResponse || req.adminNotes || '',
      expectedDate: req.expectedDate,
      createdAt: req.updatedAt
    }];
  }
  const sorted = [...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted.map((h, i) => ({
    key: `${req._id}-${h._id || i}`,
    request: req,
    status: h.status || req.status,
    message: h.message,
    expectedDate: h.expectedDate,
    createdAt: h.createdAt,
    isLatest: i === 0
  }));
};

const MainBranchUpdatesPage = () => {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('LATEST');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests');
      setRequests(res.data || []);
    } catch (err) {
      toast.error('Failed to load main branch updates');
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchRequests);

  useEffect(() => {
    fetchRequests();
    const handleRequestUpdated = () => fetchRequests();
    socket.on('medicine_request_updated', handleRequestUpdated);
    return () => socket.off('medicine_request_updated', handleRequestUpdated);
  }, []);

  const allUpdates = useMemo(() => requests.flatMap(adminUpdatesOf), [requests]);
  const latest = allUpdates.filter((u) => u.isLatest);
  const awaitingMine = latest.filter((u) => !u.request.storeResponse);
  const todayCount = allUpdates.filter((u) => inDateRange(u.createdAt, 'today')).length;

  const filtered = allUpdates
    .filter((u) => {
      if (view === 'LATEST' && !u.isLatest) return false;
      if (view === 'AWAITING' && (!u.isLatest || u.request.storeResponse)) return false;
      const r = u.request;
      const term = search.trim().toLowerCase();
      const matchesSearch = !term || [
        r.requestId, r.productName, r.medicineName, r.customer?.name, r.customer?.phone, u.message, r.storeResponse
      ].some((v) => String(v || '').toLowerCase().includes(term));
      return matchesSearch && (!statusFilter || u.status === statusFilter) && inDateRange(u.createdAt, dateRange);
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'request') return String(a.request.requestId).localeCompare(String(b.request.requestId)) || new Date(b.createdAt) - new Date(a.createdAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const paged = usePagedList(filtered, 12, `${search}|${view}|${statusFilter}|${dateRange}|${sortBy}`);

  const handleStoreResponseSaved = (updated) => {
    setRequests((prev) => prev.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)));
    setSelected((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
  };

  const handleDownload = async () => {
    if (!filtered.length) {
      toast.error('No main branch updates to download');
      return;
    }
    setExporting(true);
    try {
      const rows = filtered.map((u) => {
        const r = u.request;
        return {
          'Request ID': r.requestId,
          'Store Code': r.storeCode || r.storeId?.storeCode || user?.store?.storeCode || '',
          'Store Name': r.storeId?.storeName || user?.store?.storeName || '',
          'Update Date & Time': excelDate(u.createdAt),
          'Requested On': excelDate(r.createdAt),
          Medicine: r.productName || r.medicineName || '',
          Composition: r.composition || '',
          Quantity: r.quantity,
          'Customer Name': r.customer?.name || '',
          'Customer Phone': r.customer?.phone || '',
          Status: u.status,
          'Main Branch Response': u.message || '',
          'Expected Date': excelDay(u.expectedDate),
          'Latest Update': u.isLatest ? 'Yes' : 'No',
          'Our Customer Update': r.storeResponse || '',
          'Our Update By': r.storeResponseBy || '',
          'Our Update At': excelDate(r.storeResponseAt)
        };
      });
      await downloadExcel(rows, { fileName: 'main-branch-updates', sheetName: 'Main Branch Updates' });
      toast.success(`Downloaded ${rows.length} updates`);
    } catch (err) {
      toast.error('Could not create the Excel file');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Megaphone size={26} />}
        title="Main branch updates"
        subtitle="Every response from the main branch on your requests, with your customer updates."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchRequests} sx={{ borderRadius: '12px', fontWeight: 800 }}>
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={16} />}
              onClick={handleDownload}
              disabled={exporting || loading}
              sx={{ borderRadius: '12px', fontWeight: 800 }}
            >
              Download Excel
            </Button>
          </>
        )}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.25, sm: 2 }, mb: 2.5 }}>
        <StatCard title="Total updates" value={allUpdates.length} icon={<Megaphone size={18} />} />
        <StatCard title="Requests answered" value={latest.length} icon={<Inbox size={18} />} />
        <StatCard title="Awaiting your update" value={awaitingMine.length} icon={<Hourglass size={18} />} />
        <StatCard title="Today" value={todayCount} icon={<CalendarClock size={18} />} />
      </Box>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search request, medicine, customer, response..."
            quickFilters={[
              { value: 'LATEST', label: 'Latest per request', count: latest.length },
              { value: 'AWAITING', label: 'Awaiting my update', count: awaitingMine.length },
              { value: 'ALL', label: 'Full history', count: allUpdates.length }
            ]}
            quickValue={view}
            onQuickChange={setView}
            filters={[
              { key: 'status', label: 'Status', value: statusFilter, options: [{ value: '', label: 'Any status' }, ...STATUSES.map((s) => ({ value: s, label: s }))], onChange: setStatusFilter },
              { key: 'date', label: 'Updated', value: dateRange, options: DATE_RANGES, onChange: setDateRange }
            ]}
            sort={{ value: sortBy, options: SORTS, onChange: setSortBy }}
            resultCount={filtered.length}
            resultLabel="updates"
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={30} /></Box>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={22} />}
            title="No main branch updates"
            text={allUpdates.length ? 'Try a different search or filter.' : 'When the main branch responds to your requests, the updates show up here.'}
          />
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, p: { xs: 1.5, md: 2 } }}>
              {paged.visible.map((u) => {
                const r = u.request;
                return (
                  <Box key={u.key} sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: '14px', border: '1px solid #F1F5F9', bgcolor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 1.1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 800, color: ORANGE, fontSize: '0.85rem' }}>{r.requestId}</Typography>
                        {!u.isLatest && <Chip label="Earlier" size="small" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, bgcolor: '#F1F5F9', color: '#64748B' }} />}
                      </Box>
                      <Chip label={u.status} size="small" className={statusChipClass(u.status)} />
                    </Box>

                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem', overflowWrap: 'anywhere' }}>
                      {r.productName || r.medicineName}
                      <Box component="span" sx={{ color: ORANGE_DARK, ml: 1, fontSize: '0.8rem' }}>× {r.quantity}</Box>
                      <Box component="span" sx={{ color: '#64748B', fontWeight: 600, fontSize: '0.78rem' }}> · {r.customer?.name}{r.customer?.phone ? ` (${r.customer.phone})` : ''}</Box>
                    </Typography>

                    <Box sx={{ p: 1.25, borderRadius: '10px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <Typography sx={{ fontSize: '0.86rem', color: '#0F172A', fontWeight: 600, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        {u.message || <Box component="span" sx={{ color: '#94A3B8', fontStyle: 'italic' }}>Status changed without a note</Box>}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 0.5, sm: 1.5 }, mt: 0.75 }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Clock size={12} /> {u.createdAt ? format(new Date(u.createdAt), 'dd MMM yyyy, h:mm a') : '—'}
                        </Typography>
                        {u.expectedDate && (
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: ORANGE_DARK, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarDays size={12} /> Expected {format(new Date(u.expectedDate), 'dd MMM yyyy')}
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {u.isLatest && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: r.storeResponse ? '#7C2D12' : '#94A3B8', fontWeight: 600, overflowWrap: 'anywhere', flex: '1 1 160px', minWidth: 0 }}>
                          {r.storeResponse ? (
                            <><Box component="span" sx={{ fontWeight: 800 }}>Your update: </Box>{r.storeResponse}</>
                          ) : 'No customer update added yet'}
                        </Typography>
                        <Button
                          size="small"
                          variant={r.storeResponse ? 'text' : 'outlined'}
                          startIcon={<MessageCircleReply size={14} />}
                          onClick={() => setSelected(r)}
                          sx={{ borderRadius: '8px', fontWeight: 800, textTransform: 'none', color: ORANGE_DARK, borderColor: '#FDBA74', whiteSpace: 'nowrap' }}
                        >
                          {r.storeResponse ? 'Edit update' : 'Add update'}
                        </Button>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
            <ShowMoreFooter paged={paged} label="updates" />
          </>
        )}
      </Card>

      <RequestDetailsModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        request={selected}
        onRequestUpdated={handleStoreResponseSaved}
        userRole="MINI_STORE"
      />
    </Box>
  );
};

export default MainBranchUpdatesPage;
