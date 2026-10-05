import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Card, Chip, Button, CircularProgress } from '@mui/material';
import { MessageCircleReply, Download, RefreshCw, UserRound, Clock, ArrowUpRight, Store as StoreIcon, Inbox, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';
import useAIRefresh from '../../utils/useAIRefresh';
import { downloadExcel, excelDate, excelDay } from '../../utils/exportExcel';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, StatCard, statusChipClass } from '../../components/admin/AdminChrome';

const STATUSES = [
  'Pending', 'Available at Main Branch', 'Approved / Will Be Supplied', 'Ordered', 'Completed', 'Not Available', 'Rejected'
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'store', label: 'Store ID' }
];

const storeUpdatesOf = (req) => {
  const history = req.storeResponseHistory?.length
    ? req.storeResponseHistory
    : req.storeResponse
      ? [{ message: req.storeResponse, employeeName: req.storeResponseBy, createdAt: req.storeResponseAt || req.updatedAt }]
      : [];
  const sorted = [...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted.map((h, i) => ({
    key: `${req._id}-${h._id || i}`,
    request: req,
    message: h.message,
    employeeName: h.employeeName || 'Store Staff',
    createdAt: h.createdAt,
    isLatest: i === 0
  }));
};

const storeCodeOf = (req) => req.storeCode || req.storeId?.storeCode || '';

const StoreUpdatesPage = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('LATEST');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [exporting, setExporting] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests');
      setRequests(res.data || []);
    } catch (err) {
      toast.error('Failed to load store updates');
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchRequests);

  useEffect(() => {
    fetchRequests();
    const handleRequestUpdated = (data) => {
      if (!data?._id) return;
      setRequests((prev) => (prev.some((r) => r._id === data._id)
        ? prev.map((r) => (r._id === data._id ? { ...r, ...data } : r))
        : [data, ...prev]));
    };
    socket.on('medicine_request_updated', handleRequestUpdated);
    return () => socket.off('medicine_request_updated', handleRequestUpdated);
  }, []);

  const allUpdates = useMemo(() => requests.flatMap(storeUpdatesOf), [requests]);

  const storeOptions = useMemo(() => {
    const codes = [...new Set(allUpdates.map((u) => storeCodeOf(u.request)).filter(Boolean))].sort();
    return [{ value: '', label: 'All stores' }, ...codes.map((c) => ({ value: c, label: c }))];
  }, [allUpdates]);

  const filtered = allUpdates
    .filter((u) => {
      if (view === 'LATEST' && !u.isLatest) return false;
      if (view === 'TODAY' && !inDateRange(u.createdAt, 'today')) return false;
      const r = u.request;
      const term = search.trim().toLowerCase();
      const matchesSearch = !term || [
        r.requestId, r.productName, r.medicineName, storeCodeOf(r), r.storeId?.storeName,
        r.customer?.name, r.customer?.phone, u.message, u.employeeName
      ].some((v) => String(v || '').toLowerCase().includes(term));
      return matchesSearch
        && (!storeFilter || storeCodeOf(r) === storeFilter)
        && (!statusFilter || r.status === statusFilter)
        && inDateRange(u.createdAt, dateRange);
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'store') return storeCodeOf(a.request).localeCompare(storeCodeOf(b.request)) || new Date(b.createdAt) - new Date(a.createdAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  const paged = usePagedList(filtered, 12, `${search}|${view}|${storeFilter}|${statusFilter}|${dateRange}|${sortBy}`);

  const latestCount = allUpdates.filter((u) => u.isLatest).length;
  const todayCount = allUpdates.filter((u) => inDateRange(u.createdAt, 'today')).length;
  const storesCount = new Set(allUpdates.map((u) => storeCodeOf(u.request))).size;

  const handleDownload = async () => {
    if (!filtered.length) {
      toast.error('No store updates to download');
      return;
    }
    setExporting(true);
    try {
      const rows = filtered.map((u) => {
        const r = u.request;
        return {
          'Request ID': r.requestId,
          'Store Code': storeCodeOf(r),
          'Store Name': r.storeId?.storeName || '',
          'Update Date & Time': excelDate(u.createdAt),
          'Requested On': excelDate(r.createdAt),
          Medicine: r.productName || r.medicineName || '',
          Quantity: r.quantity,
          'Customer Name': r.customer?.name || '',
          'Customer Phone': r.customer?.phone || '',
          'Request Status': r.status,
          'Main Branch Response': r.mainBranchResponse || r.adminNotes || '',
          'Expected Date': excelDay(r.expectedDate),
          'Store Update': u.message,
          'Updated By': u.employeeName,
          'Latest Update': u.isLatest ? 'Yes' : 'No'
        };
      });
      await downloadExcel(rows, { fileName: 'store-updates', sheetName: 'Store Updates' });
      toast.success(`Downloaded ${rows.length} store updates`);
    } catch (err) {
      toast.error('Could not create the Excel file');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<MessageCircleReply size={26} />}
        title="Store updates"
        subtitle="Customer updates sent by mini stores after the main branch responded."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchRequests} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
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
        <StatCard title="Total updates" value={allUpdates.length} icon={<MessageCircleReply size={18} />} />
        <StatCard title="Requests updated" value={latestCount} icon={<Inbox size={18} />} />
        <StatCard title="Today" value={todayCount} icon={<CalendarClock size={18} />} />
        <StatCard title="Stores" value={storesCount} icon={<StoreIcon size={18} />} />
      </Box>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search request, store, medicine, customer, update text..."
            quickFilters={[
              { value: 'LATEST', label: 'Latest per request', count: latestCount },
              { value: 'ALL', label: 'Full history', count: allUpdates.length },
              { value: 'TODAY', label: 'Today', count: todayCount }
            ]}
            quickValue={view}
            onQuickChange={setView}
            filters={[
              { key: 'store', label: 'Mini store', value: storeFilter, options: storeOptions, onChange: setStoreFilter },
              { key: 'status', label: 'Request status', value: statusFilter, options: [{ value: '', label: 'Any status' }, ...STATUSES.map((s) => ({ value: s, label: s }))], onChange: setStatusFilter },
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
            icon={<MessageCircleReply size={22} />}
            title="No store updates"
            text={allUpdates.length ? 'Try a different search or filter.' : 'When a store adds a customer update on a request, it shows up here.'}
          />
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, p: { xs: 1.5, md: 2 } }}>
              {paged.visible.map((u) => {
                const r = u.request;
                const adminResponse = r.mainBranchResponse || r.adminNotes;
                return (
                  <Box key={u.key} sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 1.1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                        <Chip label={storeCodeOf(r) || 'Store'} size="small" sx={{ fontWeight: 800, bgcolor: '#CCFBF1', color: '#0F766E' }} />
                        <Button
                          size="small"
                          endIcon={<ArrowUpRight size={13} />}
                          onClick={() => navigate(`/admin/requests?open=${r._id}`)}
                          sx={{ fontWeight: 800, color: '#0F766E', p: 0, minWidth: 0, textTransform: 'none' }}
                        >
                          {r.requestId}
                        </Button>
                        {!u.isLatest && <Chip label="Earlier" size="small" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, bgcolor: '#F1F5F9', color: '#64748B' }} />}
                      </Box>
                      <Chip label={r.status} size="small" className={statusChipClass(r.status)} />
                    </Box>

                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem', overflowWrap: 'anywhere' }}>
                      {r.productName || r.medicineName}
                      <Box component="span" sx={{ color: '#0D9488', ml: 1, fontSize: '0.8rem' }}>× {r.quantity}</Box>
                      <Box component="span" sx={{ color: '#64748B', fontWeight: 600, fontSize: '0.78rem' }}> · {r.customer?.name}{r.customer?.phone ? ` (${r.customer.phone})` : ''}</Box>
                    </Typography>

                    {adminResponse && (
                      <Typography sx={{ fontSize: '0.78rem', color: '#475569', overflowWrap: 'anywhere' }}>
                        <Box component="span" sx={{ fontWeight: 800, color: '#0F766E' }}>Main branch: </Box>{adminResponse}
                      </Typography>
                    )}

                    <Box sx={{ p: 1.25, borderRadius: '10px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                      <Typography sx={{ fontSize: '0.86rem', color: '#7C2D12', fontWeight: 600, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                        {u.message}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 0.5, sm: 1.5 }, mt: 0.75 }}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#C2410C', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <UserRound size={12} /> {u.employeeName}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#9A3412', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Clock size={12} /> {u.createdAt ? format(new Date(u.createdAt), 'dd MMM yyyy, h:mm a') : '—'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
            <ShowMoreFooter paged={paged} label="updates" />
          </>
        )}
      </Card>
    </Box>
  );
};

export default StoreUpdatesPage;
