import React, { useEffect, useState } from 'react';
import { Box, Card, Button, CircularProgress } from '@mui/material';
import { MessageSquareWarning, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';
import { downloadExcel } from '../../utils/exportExcel';
import { COMPLAINT_TYPES, COMPLAINT_STATUSES, complaintSearchText, complaintExcelRow, complaintStoreCode } from '../../utils/complaints';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState } from '../../components/admin/AdminChrome';
import ComplaintsList from '../../components/ComplaintsList';
import ComplaintDetailsModal from '../../components/ComplaintDetailsModal';

const ExecutiveComplaintsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [complaints, setComplaints] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [storeFilter, setStoreFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        api.get('/complaints'),
        api.get('/stores').catch(() => ({ data: [] }))
      ]);
      setComplaints(cRes.data || []);
      setStores(sRes.data || []);
    } catch (err) {
      toast.error('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
    const handleNotif = (notif) => {
      if (notif?.type === 'NEW_COMPLAINT') fetchComplaints();
    };
    socket.on('new_notification', handleNotif);
    return () => socket.off('new_notification', handleNotif);
  }, []);

  useEffect(() => {
    if (loading) return;
    const code = searchParams.get('code');
    if (!code) return;
    const found = complaints.find((c) => String(c.complaintId || '').toUpperCase() === code.toUpperCase());
    if (found) setSelected(found);
    else toast.error('That complaint could not be found');
    setSearchParams({}, { replace: true });
  }, [loading, complaints, searchParams]);

  const filtered = complaints.filter((c) => {
    const term = search.trim().toLowerCase();
    return (!term || complaintSearchText(c).includes(term))
      && (status === 'ALL' || c.status === status)
      && (!storeFilter || String(c.storeId?._id || c.storeId) === storeFilter)
      && (!typeFilter || c.complaintType === typeFilter)
      && inDateRange(c.complaintDate || c.createdAt, dateRange);
  }).sort((a, b) => new Date(b.complaintDate || b.createdAt) - new Date(a.complaintDate || a.createdAt));

  const paged = usePagedList(filtered, 10, `${search}|${status}|${storeFilter}|${typeFilter}|${dateRange}`);

  const handleDownload = async () => {
    if (!filtered.length) {
      toast.error('No complaints to download');
      return;
    }
    setExporting(true);
    try {
      const storeCode = storeFilter ? complaintStoreCode(filtered[0]) : 'my-stores';
      await downloadExcel(filtered.map(complaintExcelRow), { fileName: `complaints-${storeCode}`, sheetName: 'Complaints' });
    } catch (err) {
      toast.error('Download failed');
    } finally {
      setExporting(false);
    }
  };

  const statusCount = (s) => complaints.filter((c) => c.status === s).length;

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<MessageSquareWarning size={26} />}
        title="Customer complaints"
        subtitle="Complaints entered by your stores. The main branch responds to them."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchComplaints} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>Refresh</Button>
            <Button variant="contained" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={16} />} disabled={exporting} onClick={handleDownload} sx={{ borderRadius: '12px', fontWeight: 800 }}>
              Download Excel
            </Button>
          </>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search customer, phone, medicine, batch, store..."
            quickFilters={[{ value: 'ALL', label: 'All', count: complaints.length }, ...COMPLAINT_STATUSES.map((s) => ({ value: s, label: s, count: statusCount(s) }))]}
            quickValue={status}
            onQuickChange={setStatus}
            filters={[
              { key: 'store', label: 'Store', value: storeFilter, options: [{ value: '', label: 'All my stores' }, ...stores.map((s) => ({ value: s._id, label: `${s.storeCode} · ${s.storeName}` }))], onChange: setStoreFilter },
              { key: 'type', label: 'Type', value: typeFilter, options: [{ value: '', label: 'All types' }, ...COMPLAINT_TYPES.map((t) => ({ value: t, label: t }))], onChange: setTypeFilter },
              { key: 'date', label: 'Date', value: dateRange, options: DATE_RANGES, onChange: setDateRange }
            ]}
            resultCount={filtered.length}
            resultLabel="complaints"
          />
        </Box>
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          {loading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={30} /></Box>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<MessageSquareWarning size={22} />} title="No complaints found" text="Complaints your stores enter will show here." />
          ) : (
            <ComplaintsList complaints={paged.visible} onOpen={setSelected} showStore />
          )}
        </Box>
        {!loading && <ShowMoreFooter paged={paged} label="complaints" />}
      </Card>

      <ComplaintDetailsModal open={Boolean(selected)} onClose={() => setSelected(null)} complaint={selected} />
    </Box>
  );
};

export default ExecutiveComplaintsPage;
