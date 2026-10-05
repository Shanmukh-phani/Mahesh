import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, Button, CircularProgress, Typography, Menu, MenuItem, ListItemIcon, ListItemText, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField
} from '@mui/material';
import {
  MessageSquareWarning, Download, RefreshCw, Hourglass, CheckCircle2, Store as StoreIcon, Reply, ChevronDown,
  FileSpreadsheet, Layers, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';
import useAIRefresh from '../../utils/useAIRefresh';
import { downloadExcel, downloadExcelSheets } from '../../utils/exportExcel';
import {
  COMPLAINT_TYPES, COMPLAINT_STATUSES, complaintSearchText, complaintExcelRow, complaintStoreCode, complaintStoreName
} from '../../utils/complaints';
import FilterBar, { DATE_RANGES, inDateRange, usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, StatCard, ChoiceChips, dialogPaperSx } from '../../components/admin/AdminChrome';
import ComplaintsList from '../../components/ComplaintsList';
import ComplaintDetailsModal from '../../components/ComplaintDetailsModal';
import NotificationContext from '../../components/NotificationContext';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'store', label: 'Store code' },
  { value: 'medicine', label: 'Medicine name' }
];

const RESPONSE_TEMPLATES = [
  { label: 'Checking batch', text: 'We are checking this batch with the supplier. Will update you shortly.', status: 'In Review' },
  { label: 'Replace', text: 'Please replace the medicine for the customer. Replacement stock will be sent.', status: 'Resolved' },
  { label: 'Refund difference', text: 'Price corrected. Please refund the price difference to the customer.', status: 'Resolved' },
  { label: 'Price is correct', text: 'The price charged matches the current MRP for this batch.', status: 'Rejected' }
];

const ComplaintsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [complaints, setComplaints] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('ALL');
  const [selectedStores, setSelectedStores] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [exporting, setExporting] = useState(false);
  const [downloadAnchor, setDownloadAnchor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [responding, setResponding] = useState(null);
  const [responseForm, setResponseForm] = useState({ status: 'In Review', message: '' });
  const [savingResponse, setSavingResponse] = useState(false);

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

  useAIRefresh(fetchComplaints);

  useEffect(() => {
    fetchComplaints();
    const handleNotif = (notif) => {
      if (notif?.type === 'NEW_COMPLAINT') fetchComplaints();
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

  // Stores from the store list plus any store codes only seen on complaints (e.g. deleted stores)
  const storeOptions = useMemo(() => {
    const map = new Map();
    stores.forEach((s) => s.storeCode && map.set(s.storeCode, { code: s.storeCode, name: s.storeName, count: 0 }));
    complaints.forEach((c) => {
      const code = complaintStoreCode(c);
      if (!code) return;
      if (!map.has(code)) map.set(code, { code, name: complaintStoreName(c), count: 0 });
      map.get(code).count += 1;
    });
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [stores, complaints]);

  const toggleStore = (code) => setSelectedStores((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const inSelectedStores = (c) => !selectedStores.length || selectedStores.includes(complaintStoreCode(c));
  const storeScoped = complaints.filter(inSelectedStores);

  const counts = {
    open: storeScoped.filter((c) => c.status === 'Open').length,
    review: storeScoped.filter((c) => c.status === 'In Review').length,
    resolved: storeScoped.filter((c) => c.status === 'Resolved').length,
    rejected: storeScoped.filter((c) => c.status === 'Rejected').length
  };

  const filtered = storeScoped
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
      if (sortBy === 'store') return complaintStoreCode(a).localeCompare(complaintStoreCode(b)) || db - da;
      if (sortBy === 'medicine') return String(a.medicineName).localeCompare(String(b.medicineName));
      return db - da || new Date(b.createdAt) - new Date(a.createdAt);
    });

  const paged = usePagedList(filtered, 12, `${search}|${view}|${selectedStores.join(',')}|${typeFilter}|${dateRange}|${sortBy}`);

  const fileBase = selectedStores.length === 1 ? `complaints-${selectedStores[0]}` : 'complaints';

  const handleDownload = async (mode) => {
    setDownloadAnchor(null);
    if (!filtered.length) {
      toast.error('No complaints to download');
      return;
    }
    setExporting(true);
    try {
      if (mode === 'per-store') {
        const groups = new Map();
        filtered.forEach((c) => {
          const code = complaintStoreCode(c) || 'Unknown';
          if (!groups.has(code)) groups.set(code, []);
          groups.get(code).push(complaintExcelRow(c));
        });
        const sheets = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => ({ name, rows }));
        await downloadExcelSheets(sheets, { fileName: `${fileBase}-by-store` });
        toast.success(`Downloaded ${filtered.length} complaints in ${sheets.length} store sheet${sheets.length > 1 ? 's' : ''}`);
      } else {
        const sheetName = selectedStores.length === 1 ? `Complaints ${selectedStores[0]}` : 'Complaints';
        await downloadExcel(filtered.map(complaintExcelRow), { fileName: fileBase, sheetName });
        toast.success(`Downloaded ${filtered.length} complaints`);
      }
    } catch (err) {
      toast.error('Could not create the Excel file');
    } finally {
      setExporting(false);
    }
  };

  const openRespond = (c) => {
    setResponding(c);
    setResponseForm({ status: c.status === 'Open' ? 'In Review' : c.status, message: '' });
  };

  const handleRespond = async (e) => {
    e.preventDefault();
    if (!responding) return;
    if (!responseForm.message.trim() && responseForm.status === responding.status) {
      toast.error('Add a response or change the status');
      return;
    }
    setSavingResponse(true);
    try {
      const res = await api.put(`/complaints/${responding._id}/response`, { status: responseForm.status, message: responseForm.message.trim() });
      setComplaints((prev) => prev.map((c) => (c._id === res.data._id ? res.data : c)));
      toast.success(`Response sent to ${complaintStoreCode(res.data) || 'store'}`);
      setResponding(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save response');
    } finally {
      setSavingResponse(false);
    }
  };

  const renderActions = (c) => (
    <Button
      size="small"
      variant={c.adminResponse ? 'text' : 'outlined'}
      startIcon={<Reply size={14} />}
      onClick={(e) => { e.stopPropagation(); openRespond(c); }}
      sx={{ borderRadius: '8px', fontWeight: 800, whiteSpace: 'nowrap' }}
    >
      {c.adminResponse ? 'Update response' : 'Respond'}
    </Button>
  );

  const storesWithComplaints = new Set(complaints.map(complaintStoreCode).filter(Boolean)).size;

  return (
    <Box sx={{ maxWidth: '1400px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<MessageSquareWarning size={26} />}
        title="Customer complaints"
        subtitle="Medicine quality and price complaints raised by mini stores. Respond to update the store."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchComplaints} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={16} />}
              endIcon={<ChevronDown size={14} />}
              onClick={(e) => setDownloadAnchor(e.currentTarget)}
              disabled={exporting || loading}
              sx={{ borderRadius: '12px', fontWeight: 800 }}
            >
              Download Excel
            </Button>
            <Menu
              anchorEl={downloadAnchor}
              open={Boolean(downloadAnchor)}
              onClose={() => setDownloadAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{ sx: { borderRadius: '12px', maxWidth: 'calc(100vw - 24px)' } }}
            >
              <MenuItem onClick={() => handleDownload('single')}>
                <ListItemIcon><FileSpreadsheet size={17} /></ListItemIcon>
                <ListItemText
                  primary={selectedStores.length === 1 ? `${selectedStores[0]} complaints` : 'Current list (one sheet)'}
                  secondary={`${filtered.length} complaints with current filters`}
                />
              </MenuItem>
              <MenuItem onClick={() => handleDownload('per-store')}>
                <ListItemIcon><Layers size={17} /></ListItemIcon>
                <ListItemText primary="One sheet per store" secondary="Separate sheet for each selected store" />
              </MenuItem>
            </Menu>
          </>
        )}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.25, sm: 2 }, mb: 2.5 }}>
        <StatCard title={selectedStores.length ? 'Complaints (selected)' : 'Total complaints'} value={storeScoped.length} icon={<MessageSquareWarning size={18} />} />
        <StatCard title="Open" value={counts.open} icon={<Hourglass size={18} />} accent="#D97706" />
        <StatCard title="Resolved" value={counts.resolved} icon={<CheckCircle2 size={18} />} accent="#16A34A" />
        <StatCard title="Stores reporting" value={storesWithComplaints} icon={<StoreIcon size={18} />} />
      </Box>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.9, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Stores {selectedStores.length ? `· ${selectedStores.length} selected` : '· all'}
              </Typography>
              {selectedStores.length > 0 && (
                <Button size="small" onClick={() => setSelectedStores([])} sx={{ fontWeight: 800, color: '#64748B', minWidth: 0, p: 0 }}>Clear</Button>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', maxHeight: { xs: 132, md: 'none' }, overflowY: 'auto' }}>
              {storeOptions.length === 0 && (
                <Typography sx={{ fontSize: '0.8rem', color: '#94A3B8' }}>No stores yet</Typography>
              )}
              {storeOptions.map((s) => {
                const active = selectedStores.includes(s.code);
                return (
                  <Box
                    key={s.code}
                    component="button"
                    type="button"
                    onClick={() => toggleStore(s.code)}
                    title={s.name ? `${s.code} · ${s.name}` : s.code}
                    sx={{
                      border: '1px solid',
                      borderColor: active ? '#0D9488' : '#E2E8F0',
                      bgcolor: active ? '#CCFBF1' : '#FFFFFF',
                      color: active ? '#0F766E' : '#475569',
                      fontFamily: 'inherit',
                      fontWeight: 800,
                      fontSize: '0.76rem',
                      px: 1.1,
                      py: 0.55,
                      borderRadius: '9px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      maxWidth: '100%',
                      minWidth: 0
                    }}
                  >
                    {active ? <Check size={13} style={{ flexShrink: 0 }} /> : <StoreIcon size={13} style={{ flexShrink: 0 }} />}
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.code}{s.name ? ` · ${s.name}` : ''}
                    </Box>
                    <Box component="span" sx={{ px: 0.6, borderRadius: '99px', fontSize: '0.66rem', bgcolor: active ? '#0D9488' : '#F1F5F9', color: active ? '#FFFFFF' : '#64748B', flexShrink: 0 }}>
                      {s.count}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search complaint ID, store, customer, medicine, batch..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: storeScoped.length },
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
            text={complaints.length ? 'Try a different store, search or filter.' : 'When a mini store records a customer complaint, it shows up here.'}
          />
        ) : (
          <>
            <ComplaintsList complaints={paged.visible} onOpen={setSelected} renderActions={renderActions} showStore />
            <ShowMoreFooter paged={paged} label="complaints" />
          </>
        )}
      </Card>

      <ComplaintDetailsModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        complaint={selected}
        actions={selected && (
          <Button variant="contained" startIcon={<Reply size={15} />} onClick={() => { const c = selected; setSelected(null); openRespond(c); }} sx={{ fontWeight: 800, borderRadius: '10px' }}>
            {selected.adminResponse ? 'Update response' : 'Respond'}
          </Button>
        )}
      />

      <Dialog open={Boolean(responding)} onClose={savingResponse ? undefined : () => setResponding(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { ...dialogPaperSx, m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } }}>
        <form onSubmit={handleRespond}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Respond to complaint</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {responding && (
              <Box>
                <NotificationContext
                  notif={{ requestCode: responding.complaintId, storeCode: complaintStoreCode(responding), storeName: complaintStoreName(responding) }}
                  sx={{ mt: 0 }}
                />
                <Typography sx={{ color: '#64748B', fontSize: '0.85rem', mt: 1, overflowWrap: 'anywhere' }}>
                  {responding.medicineName}{responding.medicineBrand ? ` (${responding.medicineBrand})` : ''} · {responding.complaintType} · {responding.customerName}
                </Typography>
                <Typography sx={{ color: '#7C2D12', fontSize: '0.82rem', mt: 0.75, p: 1, borderRadius: '8px', bgcolor: '#FFF7ED', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                  {responding.complaintText}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>STATUS</Typography>
              <ChoiceChips options={COMPLAINT_STATUSES} value={responseForm.status} onChange={(status) => setResponseForm((prev) => ({ ...prev, status }))} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>QUICK RESPONSE</Typography>
              <ChoiceChips
                options={RESPONSE_TEMPLATES.map((t) => ({ value: t.label, label: t.label }))}
                value=""
                onChange={(label) => {
                  const t = RESPONSE_TEMPLATES.find((x) => x.label === label);
                  if (t) setResponseForm({ status: t.status, message: t.text });
                }}
              />
            </Box>
            <TextField
              label="Response to store"
              value={responseForm.message}
              onChange={(e) => setResponseForm((prev) => ({ ...prev, message: e.target.value }))}
              multiline
              minRows={3}
              maxRows={8}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              helperText={responding?.adminResponse ? `Previous: ${responding.adminResponse}` : 'The store is notified immediately.'}
              sx={{ '& .MuiFormHelperText-root': { overflowWrap: 'anywhere' } }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => setResponding(null)} disabled={savingResponse} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingResponse} startIcon={savingResponse ? <CircularProgress size={14} color="inherit" /> : <Reply size={15} />} sx={{ fontWeight: 800, borderRadius: '10px' }}>
              Send response
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default ComplaintsPage;
