import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Box, Card, Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { MessageSquareWarning, Download, RefreshCw, Plus, Pencil, Trash2, Hourglass, CheckCircle2, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';
import { AuthContext } from '../../context/AuthContext';
import useAIRefresh from '../../utils/useAIRefresh';
import { downloadExcel } from '../../utils/exportExcel';
import { COMPLAINT_TYPES, complaintSearchText, complaintExcelRow } from '../../utils/complaints';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, StatCard } from '../../components/admin/AdminChrome';
import ComplaintsList from '../../components/ComplaintsList';
import ComplaintFormDialog from '../../components/ComplaintFormDialog';
import ComplaintDetailsModal from '../../components/ComplaintDetailsModal';
import ConfirmDialog from '../../components/ConfirmDialog';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'medicine', label: 'Medicine name' }
];

const StoreComplaintsPage = () => {
  const { user } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [exporting, setExporting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const res = await api.get('/complaints');
      setComplaints(res.data || []);
    } catch (err) {
      toast.error('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchComplaints);

  useEffect(() => {
    fetchComplaints();
    const handleNotif = (notif) => {
      if (notif?.type === 'COMPLAINT_RESPONSE') fetchComplaints();
    };
    socket.on('new_notification', handleNotif);
    return () => socket.off('new_notification', handleNotif);
  }, []);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code || loading) return;
    const match = complaints.find((c) => String(c.complaintId).toUpperCase() === code.toUpperCase());
    if (match) setSelected(match);
    setSearchParams({}, { replace: true });
  }, [searchParams, complaints, loading]);

  useEffect(() => {
    setSelected((prev) => (prev ? complaints.find((c) => c._id === prev._id) || null : prev));
  }, [complaints]);

  const counts = useMemo(() => ({
    open: complaints.filter((c) => c.status === 'Open').length,
    review: complaints.filter((c) => c.status === 'In Review').length,
    resolved: complaints.filter((c) => c.status === 'Resolved').length,
    rejected: complaints.filter((c) => c.status === 'Rejected').length,
    awaiting: complaints.filter((c) => !c.adminResponse && c.status === 'Open').length,
    month: complaints.filter((c) => inDateRange(c.complaintDate || c.createdAt, '30d')).length
  }), [complaints]);

  const filtered = complaints
    .filter((c) => {
      if (view !== 'ALL' && c.status !== view) return false;
      const term = search.trim().toLowerCase();
      return (!term || complaintSearchText(c).includes(term))
        && (!typeFilter || c.complaintType === typeFilter)
        && inDateRange(c.complaintDate || c.createdAt, dateRange);
    })
    .sort((a, b) => {
      const da = new Date(a.complaintDate || a.createdAt);
      const db = new Date(b.complaintDate || b.createdAt);
      if (sortBy === 'oldest') return da - db;
      if (sortBy === 'medicine') return String(a.medicineName).localeCompare(String(b.medicineName));
      return db - da || new Date(b.createdAt) - new Date(a.createdAt);
    });

  const paged = usePagedList(filtered, 12, `${search}|${view}|${typeFilter}|${dateRange}|${sortBy}`);

  const handleSaved = (saved, isEdit) => {
    setComplaints((prev) => (isEdit ? prev.map((c) => (c._id === saved._id ? saved : c)) : [saved, ...prev]));
  };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (c) => { setSelected(null); setEditing(c); setFormOpen(true); };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/complaints/${toDelete._id}`);
      setComplaints((prev) => prev.filter((c) => c._id !== toDelete._id));
      if (selected?._id === toDelete._id) setSelected(null);
      toast.success(`Complaint ${toDelete.complaintId} deleted`);
      setToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete complaint');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!filtered.length) {
      toast.error('No complaints to download');
      return;
    }
    setExporting(true);
    try {
      const rows = filtered.map((c) => complaintExcelRow({
        ...c,
        storeCode: c.storeCode || user?.store?.storeCode,
        storeName: c.storeName || user?.store?.storeName
      }));
      const code = user?.store?.storeCode || filtered[0]?.storeCode || 'store';
      await downloadExcel(rows, { fileName: `complaints-${code}`, sheetName: `Complaints ${code}` });
      toast.success(`Downloaded ${rows.length} complaints`);
    } catch (err) {
      toast.error('Could not create the Excel file');
    } finally {
      setExporting(false);
    }
  };

  const renderActions = (c) => (
    <>
      <Tooltip title="Edit">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEdit(c); }} sx={{ border: '1px solid #FED7AA', color: '#C2410C' }}>
          <Pencil size={15} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setToDelete(c); }} sx={{ border: '1px solid #FECACA', color: '#B91C1C' }}>
          <Trash2 size={15} />
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<MessageSquareWarning size={26} />}
        title="Customer complaints"
        subtitle="Record medicine quality or price complaints from customers. Each one goes straight to the main branch."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchComplaints} sx={{ borderRadius: '12px', fontWeight: 800 }}>
              Refresh
            </Button>
            <Button
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={16} />}
              onClick={handleDownload}
              disabled={exporting || loading}
              sx={{ borderRadius: '12px', fontWeight: 800 }}
            >
              Download Excel
            </Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew} sx={{ borderRadius: '12px', fontWeight: 800 }}>
              New complaint
            </Button>
          </>
        )}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.25, sm: 2 }, mb: 2.5 }}>
        <StatCard title="Total complaints" value={complaints.length} icon={<MessageSquareWarning size={18} />} />
        <StatCard title="Awaiting response" value={counts.awaiting} icon={<Hourglass size={18} />} accent="#D97706" />
        <StatCard title="Resolved" value={counts.resolved} icon={<CheckCircle2 size={18} />} accent="#16A34A" />
        <StatCard title="Last 30 days" value={counts.month} icon={<CalendarClock size={18} />} />
      </Box>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search complaint ID, customer, phone, medicine, batch..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: complaints.length },
              { value: 'Open', label: 'Open', count: counts.open },
              { value: 'In Review', label: 'In review', count: counts.review },
              { value: 'Resolved', label: 'Resolved', count: counts.resolved },
              { value: 'Rejected', label: 'Rejected', count: counts.rejected }
            ]}
            quickValue={view}
            onQuickChange={setView}
            filters={[
              { key: 'type', label: 'Complaint type', value: typeFilter, options: [{ value: '', label: 'Any type' }, ...COMPLAINT_TYPES.map((t) => ({ value: t, label: t }))], onChange: setTypeFilter },
              { key: 'date', label: 'Complaint date', value: dateRange, options: DATE_RANGES, onChange: setDateRange }
            ]}
            sort={{ value: sortBy, options: SORTS, onChange: setSortBy }}
            resultCount={filtered.length}
            resultLabel="complaints"
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={30} /></Box>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning size={22} />}
            title="No complaints"
            text={complaints.length ? 'Try a different search or filter.' : 'Use "New complaint" to record a customer complaint about a medicine.'}
          />
        ) : (
          <>
            <ComplaintsList complaints={paged.visible} onOpen={setSelected} renderActions={renderActions} variant="store" />
            <ShowMoreFooter paged={paged} label="complaints" />
          </>
        )}
      </Card>

      <ComplaintFormDialog open={formOpen} onClose={() => setFormOpen(false)} complaint={editing} onSaved={handleSaved} />

      <ComplaintDetailsModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        complaint={selected}
        variant="store"
        actions={selected && (
          <>
            <Button color="error" startIcon={<Trash2 size={15} />} onClick={() => setToDelete(selected)} sx={{ fontWeight: 800, mr: 'auto' }}>Delete</Button>
            <Button variant="outlined" startIcon={<Pencil size={15} />} onClick={() => openEdit(selected)} sx={{ fontWeight: 800, borderRadius: '10px' }}>Edit</Button>
          </>
        )}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete complaint?"
        message={toDelete ? `Complaint ${toDelete.complaintId} (${toDelete.medicineName} · ${toDelete.customerName}) will be removed for both this store and the main branch.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </Box>
  );
};

export default StoreComplaintsPage;
