import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, MenuItem, Select,
  FormControl, InputLabel, Button, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip, IconButton
} from '@mui/material';
import { Package, Plus, Edit3, RefreshCw, AlertTriangle, UploadCloud } from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import InventoryUploadDialog from '../../components/InventoryUploadDialog';
import FilterBar, { usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, EmptyState, dialogPaperSx, ChoiceChips, QtyStepper } from '../../components/admin/AdminChrome';

const CATEGORIES = ['Pain Relief', 'Antibiotic', 'Allergy', 'Antacid', 'Vitamins', 'Cardiology', 'Diabetes'];

const emptyMed = {
  name: '',
  genericName: '',
  category: 'Pain Relief',
  manufacturer: '',
  quantity: 100,
  batchNumber: '',
  expiryDate: '',
  minReorderLevel: 50
};

const MainInventoryPage = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [newMed, setNewMed] = useState(emptyMed);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({ quantity: 0, batchNumber: '', minReorderLevel: 50 });

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/main');
      setInventory(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load main inventory');
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchInventory);

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newMed.name.trim()) {
      toast.error('Brand name is required');
      return;
    }
    if (Number(newMed.quantity) < 0) {
      toast.error('Opening stock cannot be negative');
      return;
    }
    if (Number(newMed.minReorderLevel) < 0) {
      toast.error('Reorder level cannot be negative');
      return;
    }
    try {
      await api.post('/inventory/main/add-medicine', { ...newMed, genericName: newMed.genericName || newMed.name });
      toast.success('Medicine added to Main Inventory successfully');
      setOpenAddModal(false);
      setNewMed(emptyMed);
      fetchInventory();
    } catch (err) {
      toast.error('Failed to add medicine');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/inventory/main/${selectedItem._id}`, editForm);
      toast.success('Stock updated successfully');
      setOpenEditModal(false);
      fetchInventory();
    } catch (err) {
      toast.error('Failed to update stock');
    }
  };

  const filteredInventory = (inventory || []).filter((item) => {
    const medName = item.medicineId?.name || '';
    const genericName = item.medicineId?.genericName || '';
    const batch = item.batchNumber || '';
    const category = item.medicineId?.category || '';
    const matchesSearch =
      medName.toLowerCase().includes(search.toLowerCase()) ||
      genericName.toLowerCase().includes(search.toLowerCase()) ||
      batch.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? category === categoryFilter : true;
    let matchesStatus = true;
    if (statusFilter === 'LOW') matchesStatus = item.quantity <= (item.minReorderLevel || 50);
    else if (statusFilter === 'OUT') matchesStatus = item.quantity === 0;
    else if (statusFilter === 'IN_STOCK') matchesStatus = item.quantity > (item.minReorderLevel || 50);
    let matchesExpiry = true;
    if (expiryFilter) {
      const exp = item.expiryDate ? new Date(item.expiryDate) : null;
      const daysLeft = exp ? (exp - new Date()) / 86400000 : null;
      if (expiryFilter === 'EXPIRED') matchesExpiry = daysLeft !== null && daysLeft < 0;
      else if (expiryFilter === 'SOON') matchesExpiry = daysLeft !== null && daysLeft >= 0 && daysLeft <= 90;
      else if (expiryFilter === 'NONE') matchesExpiry = !exp;
    }
    return matchesSearch && matchesCategory && matchesStatus && matchesExpiry;
  }).sort((a, b) => {
    if (sortBy === 'qtyLow') return Number(a.quantity || 0) - Number(b.quantity || 0);
    if (sortBy === 'qtyHigh') return Number(b.quantity || 0) - Number(a.quantity || 0);
    if (sortBy === 'expiry') return new Date(a.expiryDate || '9999-12-31') - new Date(b.expiryDate || '9999-12-31');
    return String(a.medicineId?.name || '').localeCompare(String(b.medicineId?.name || ''));
  });

  const paged = usePagedList(filteredInventory, 12, `${search}|${categoryFilter}|${statusFilter}|${expiryFilter}|${sortBy}`);

  const totalItems = inventory.length;
  const totalStockUnits = inventory.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
  const lowStockCount = inventory.filter((i) => i.quantity <= (i.minReorderLevel || 50)).length;
  const inStockCount = inventory.filter((i) => i.quantity > (i.minReorderLevel || 50)).length;
  const outStockCount = inventory.filter((i) => i.quantity === 0).length;

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditForm({
      quantity: item.quantity,
      batchNumber: item.batchNumber || '',
      minReorderLevel: item.minReorderLevel || 50
    });
    setOpenEditModal(true);
  };

  const stockMeta = (item) => {
    const isOut = item.quantity === 0;
    const isLow = item.quantity <= (item.minReorderLevel || 50);
    if (isOut) return { label: 'Out of stock', bg: '#FEE2E2', color: '#991B1B', qty: '#EF4444' };
    if (isLow) return { label: 'Low stock', bg: '#FEF3C7', color: '#92400E', qty: '#D97706' };
    return { label: 'In stock', bg: '#DCFCE7', color: '#166534', qty: '#0D9488' };
  };

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Package size={26} />}
        title="Main inventory"
        subtitle="Warehouse SKUs, batch numbers, expiry, and reorder levels."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchInventory} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>Refresh</Button>
            <Button variant="outlined" startIcon={<UploadCloud size={16} />} onClick={() => setOpenUpload(true)} sx={{ borderRadius: '12px', fontWeight: 800 }}>Upload CSV / Excel</Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAddModal(true)} sx={{ borderRadius: '12px', fontWeight: 800 }}>Add medicine</Button>
          </>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', mb: { xs: 1.5, lg: 0 } }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search medicine, generic name or batch..."
            quickFilters={[
              { value: '', label: 'All', count: totalItems },
              { value: 'IN_STOCK', label: 'In stock', count: inStockCount },
              { value: 'LOW', label: 'Low', count: lowStockCount },
              { value: 'OUT', label: 'Out', count: outStockCount }
            ]}
            quickValue={statusFilter}
            onQuickChange={setStatusFilter}
            filters={[
              { key: 'category', label: 'Category', value: categoryFilter, options: [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))], onChange: setCategoryFilter },
              {
                key: 'expiry',
                label: 'Expiry',
                value: expiryFilter,
                onChange: setExpiryFilter,
                options: [
                  { value: '', label: 'Any' },
                  { value: 'SOON', label: 'Expiring in 90 days' },
                  { value: 'EXPIRED', label: 'Expired' },
                  { value: 'NONE', label: 'No expiry set' }
                ]
              }
            ]}
            sort={{
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'name', label: 'Name: A to Z' },
                { value: 'qtyLow', label: 'Stock: low to high' },
                { value: 'qtyHigh', label: 'Stock: high to low' },
                { value: 'expiry', label: 'Expiry: soonest first' }
              ]
            }}
            resultCount={filteredInventory.length}
            resultLabel={`SKUs · ${totalStockUnits.toLocaleString()} units in warehouse`}
          />
        </Box>

        <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : filteredInventory.length === 0 ? (
            <EmptyState icon={<Package size={22} />} title="No inventory matches" text="Add a medicine or clear the current filters." />
          ) : paged.visible.map((item) => {
            const meta = stockMeta(item);
            return (
              <Box key={item._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{item.medicineId?.name || 'Unnamed medicine'}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.75rem' }}>{item.medicineId?.genericName || item.batchNumber || ''}</Typography>
                  </Box>
                  <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 800 }} />
                </Box>
                <Typography sx={{ mt: 1, fontWeight: 800, color: meta.qty }}>{item.quantity} units</Typography>
                <Button size="small" startIcon={<Edit3 size={14} />} onClick={() => openEdit(item)} sx={{ mt: 1, fontWeight: 800 }}>Update</Button>
              </Box>
            );
          })}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', lg: 'block' } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Medicine</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Batch</TableCell>
                <TableCell>Expiry</TableCell>
                <TableCell align="center">Stock</TableCell>
                <TableCell align="center">Reorder</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
              ) : filteredInventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState icon={<Package size={22} />} title="No inventory matches" text="Add a medicine or clear the current filters." />
                  </TableCell>
                </TableRow>
              ) : paged.visible.map((item) => {
                const meta = stockMeta(item);
                return (
                  <TableRow key={item._id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>{item.medicineId?.name || 'Unnamed medicine'}</Typography>
                      <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{item.medicineId?.genericName || ''}</Typography>
                    </TableCell>
                    <TableCell><Chip label={item.medicineId?.category || 'General'} size="small" sx={{ bgcolor: '#F1F5F9', color: '#475569', fontWeight: 700 }} /></TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#475569' }}>{item.batchNumber || 'N/A'}</TableCell>
                    <TableCell>{item.expiryDate ? format(new Date(item.expiryDate), 'MMM yyyy') : 'N/A'}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: meta.qty }}>{item.quantity} units</TableCell>
                    <TableCell align="center" sx={{ color: '#64748B' }}>{item.minReorderLevel || 50}</TableCell>
                    <TableCell align="center"><Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 800 }} /></TableCell>
                    <TableCell align="right">
                      <Tooltip title="Update stock">
                        <IconButton size="small" onClick={() => openEdit(item)} sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
                          <Edit3 size={16} color="#0F172A" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && <ShowMoreFooter paged={paged} label="SKUs" />}
      </Card>

      <Dialog open={openAddModal} onClose={() => setOpenAddModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleAddSubmit}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Add medicine</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'grid', gap: 2, mt: 0.5 }}>
              <TextField fullWidth required autoFocus label="Brand name" placeholder="e.g. Dolo 650" value={newMed.name} onChange={(e) => setNewMed({ ...newMed, name: e.target.value, genericName: newMed.genericName || e.target.value })} />
              <TextField fullWidth label="Generic name" value={newMed.genericName} onChange={(e) => setNewMed({ ...newMed, genericName: e.target.value })} />
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>CATEGORY</Typography>
                <ChoiceChips options={CATEGORIES} value={newMed.category} onChange={(category) => setNewMed({ ...newMed, category })} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>OPENING STOCK</Typography>
                <QtyStepper value={newMed.quantity} onChange={(quantity) => setNewMed({ ...newMed, quantity })} min={0} presets={[50, 100, 250, 500]} />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField fullWidth label="Batch number" placeholder="Auto if empty" value={newMed.batchNumber} onChange={(e) => setNewMed({ ...newMed, batchNumber: e.target.value })} />
                <TextField fullWidth type="number" label="Reorder level" value={newMed.minReorderLevel} onChange={(e) => setNewMed({ ...newMed, minReorderLevel: Number(e.target.value) })} />
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenAddModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ fontWeight: 800 }}>Save medicine</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={openEditModal} onClose={() => setOpenEditModal(false)} maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleEditSubmit}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Update stock</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography sx={{ color: '#64748B', fontSize: '0.88rem' }}>
              {selectedItem?.medicineId?.name}
            </Typography>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>WAREHOUSE QTY</Typography>
              <QtyStepper value={editForm.quantity} onChange={(quantity) => setEditForm({ ...editForm, quantity })} min={0} presets={[10, 50, 100, 250]} />
            </Box>
            <TextField fullWidth label="Batch number" value={editForm.batchNumber} onChange={(e) => setEditForm({ ...editForm, batchNumber: e.target.value })} />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenEditModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ fontWeight: 800 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>
      <InventoryUploadDialog open={openUpload} onClose={() => setOpenUpload(false)} mode="main" onUploaded={fetchInventory} />
    </Box>
  );
};

export default MainInventoryPage;
