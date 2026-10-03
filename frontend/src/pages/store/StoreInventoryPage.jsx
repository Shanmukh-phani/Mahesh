import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Chip, TextField, Button, CircularProgress, 
  Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete
} from '@mui/material';
import { Package, Plus, RefreshCw, Pencil, UploadCloud } from 'lucide-react';
import InventoryUploadDialog from '../../components/InventoryUploadDialog';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import toast from 'react-hot-toast';
import { QtyStepper, dialogPaperSx, PageHeader, EmptyState } from '../../components/admin/AdminChrome';
import FilterBar, { usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { qtyError } from '../../utils/validation';

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const stockChip = (qty) => {
  if (qty > 5) return <Chip label="In Stock" size="small" sx={{ bgcolor: '#DCFCE7', color: '#166534', fontWeight: 800 }} />;
  if (qty > 0) return <Chip label="Low Stock" size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 800 }} />;
  return <Chip label="Out of Stock" size="small" sx={{ bgcolor: '#FEE2E2', color: '#991B1B', fontWeight: 800 }} />;
};

const StoreInventoryPage = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockQuick, setStockQuick] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [medicines, setMedicines] = useState([]);

  // Add/Update Stock Modal
  const [openModal, setOpenModal] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [form, setForm] = useState({
    medicineId: '',
    quantity: 10,
    batchNumber: '',
    expiryDate: ''
  });
  const selectedMedicine = medicines.find((m) => m._id === form.medicineId) || null;

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/store');
      setInventory(res.data);
    } catch (err) {
      toast.error('Failed to load store inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchMedicines = async () => {
    try {
      const res = await api.get('/medicines');
      setMedicines(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useAIRefresh(fetchInventory);

  useEffect(() => {
    fetchInventory();
    fetchMedicines();
  }, []);

  const handleStockSubmit = async (e) => {
    e.preventDefault();
    if (!form.medicineId) {
      toast.error('Select a medicine');
      return;
    }
    const qtyErr = qtyError(form.quantity, 0);
    if (qtyErr) {
      toast.error(qtyErr);
      return;
    }
    try {
      await api.post('/inventory/store', form);
      toast.success('Local store stock updated');
      setOpenModal(false);
      fetchInventory();
    } catch (err) {
      toast.error('Failed to update stock');
    }
  };

  const openNewStock = () => {
    setForm({ medicineId: '', quantity: 10, batchNumber: '', expiryDate: '' });
    setOpenModal(true);
  };

  const openUpdateStock = (item) => {
    setForm({
      medicineId: item.medicineId?._id || '',
      quantity: Number(item.quantity) || 0,
      batchNumber: item.batchNumber || '',
      expiryDate: ''
    });
    setOpenModal(true);
  };

  const stockLevel = (qty) => (qty > 5 ? 'IN' : qty > 0 ? 'LOW' : 'OUT');

  const filteredInventory = inventory.filter(item => {
    const term = search.toLowerCase();
    const name = item.medicineId?.name || '';
    const generic = item.medicineId?.genericName || '';
    const matchesSearch = name.toLowerCase().includes(term) || generic.toLowerCase().includes(term);
    const matchesStock = stockQuick === 'ALL' || stockLevel(item.quantity) === stockQuick;
    const matchesCategory = !categoryFilter || (item.medicineId?.category || 'General') === categoryFilter;
    return matchesSearch && matchesStock && matchesCategory;
  }).sort((a, b) => {
    if (sortBy === 'qtyHigh') return Number(b.quantity || 0) - Number(a.quantity || 0);
    if (sortBy === 'qtyLow') return Number(a.quantity || 0) - Number(b.quantity || 0);
    if (sortBy === 'recent') return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    return String(a.medicineId?.name || '').localeCompare(String(b.medicineId?.name || ''));
  });

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...Array.from(new Set(inventory.map((i) => i.medicineId?.category || 'General'))).sort().map((c) => ({ value: c, label: c }))
  ];

  const paged = usePagedList(filteredInventory, 12, `${search}|${stockQuick}|${categoryFilter}|${sortBy}`);

  const totalUnits = inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const inCount = inventory.filter((item) => item.quantity > 5).length;
  const lowCount = inventory.filter((item) => item.quantity > 0 && item.quantity <= 5).length;
  const outCount = inventory.filter((item) => !(item.quantity > 0)).length;
  const isUpdating = Boolean(form.medicineId && inventory.some((i) => i.medicineId?._id === form.medicineId));

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Package size={26} />}
        title="My Store Inventory"
        subtitle="Current stock levels on the shelf at this mini store branch."
        actions={(
          <>
            <Button 
              variant="outlined" 
              startIcon={<RefreshCw size={18} />} 
              onClick={fetchInventory}
              sx={{ borderRadius: '12px', fontWeight: 800 }}
            >
              Refresh
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<UploadCloud size={18} />} 
              onClick={() => setOpenUpload(true)}
              sx={{ borderRadius: '12px', fontWeight: 800 }}
            >
              Upload CSV / Excel
            </Button>
            <Button 
              variant="contained" 
              color="secondary"
              startIcon={<Plus size={18} />} 
              onClick={openNewStock}
              sx={{ borderRadius: '12px', px: 2.5, fontWeight: 800 }}
            >
              Log Shelf Stock
            </Button>
          </>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search medicine or generic name..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: inventory.length },
              { value: 'IN', label: 'In stock', count: inCount },
              { value: 'LOW', label: 'Low', count: lowCount },
              { value: 'OUT', label: 'Out', count: outCount }
            ]}
            quickValue={stockQuick}
            onQuickChange={setStockQuick}
            filters={[
              { key: 'category', label: 'Category', value: categoryFilter, options: categoryOptions, onChange: setCategoryFilter }
            ]}
            sort={{
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'name', label: 'Name: A to Z' },
                { value: 'qtyLow', label: 'Quantity: low to high' },
                { value: 'qtyHigh', label: 'Quantity: high to low' },
                { value: 'recent', label: 'Recently updated' }
              ]
            }}
            resultCount={filteredInventory.length}
            resultLabel={`medicines · ${totalUnits.toLocaleString()} units on shelf`}
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} /></Box>
        ) : filteredInventory.length === 0 ? (
          <Box>
            <EmptyState
              icon={<Package size={22} />}
              title={search || stockQuick !== 'ALL' || categoryFilter ? 'No matching medicines' : 'No stock recorded yet'}
              text={search || stockQuick !== 'ALL' || categoryFilter ? 'Try a different search or filter.' : 'Log your first shelf stock to start tracking this branch.'}
            />
            {!search && stockQuick === 'ALL' && !categoryFilter && (
              <Box sx={{ textAlign: 'center', pb: 4, mt: -2 }}>
                <Button variant="contained" color="secondary" startIcon={<Plus size={18} />} onClick={openNewStock} sx={{ borderRadius: '12px', fontWeight: 800 }}>
                  Log Shelf Stock
                </Button>
              </Box>
            )}
          </Box>
        ) : (
          <>
            {/* Mobile cards */}
            <Box sx={{ display: { xs: 'grid', md: 'none' }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, p: 1.5, gap: 1.25 }}>
              {paged.visible.map((item) => (
                <Box key={item._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #F1F5F9', bgcolor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem', wordBreak: 'break-word' }}>{item.medicineId?.name}</Typography>
                      {item.medicineId?.genericName && (
                        <Typography sx={{ color: '#64748B', fontSize: '0.76rem' }}>{item.medicineId.genericName}</Typography>
                      )}
                    </Box>
                    {stockChip(item.quantity)}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={item.medicineId?.category || 'General'} size="small" sx={{ bgcolor: '#F1F5F9', fontWeight: 700 }} />
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.74rem', fontWeight: 600 }}>Batch: {item.batchNumber || 'N/A'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: ORANGE_DARK, fontSize: '1.1rem' }}>
                      {item.quantity}
                      <Box component="span" sx={{ color: '#64748B', fontWeight: 700, fontSize: '0.78rem', ml: 0.5 }}>units</Box>
                    </Typography>
                    <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={() => openUpdateStock(item)} sx={{ borderRadius: '10px', fontWeight: 800, py: 0.5 }}>
                      Update
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Desktop table */}
            <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 3 }}>Medicine Name</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Batch #</TableCell>
                    <TableCell align="center">Shelf Quantity</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="right" sx={{ pr: 3 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.visible.map((item) => (
                    <TableRow key={item._id} hover sx={{ '&:hover': { bgcolor: '#FFF7ED !important' } }}>
                      <TableCell sx={{ pl: 3 }}>
                        <Typography variant="subtitle2" fontWeight="700" color="#0F172A">{item.medicineId?.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.medicineId?.genericName}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={item.medicineId?.category || 'General'} size="small" sx={{ bgcolor: '#F1F5F9', fontWeight: 700 }} />
                      </TableCell>
                      <TableCell sx={{ color: '#64748B', fontWeight: 600 }}>{item.batchNumber || 'N/A'}</TableCell>
                      <TableCell align="center">
                        <Box component="span" sx={{ px: 1.25, py: 0.5, borderRadius: '8px', bgcolor: '#FFF7ED', color: ORANGE_DARK, fontWeight: 800, fontSize: '0.85rem' }}>
                          {item.quantity} units
                        </Box>
                      </TableCell>
                      <TableCell align="center">{stockChip(item.quantity)}</TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>
                        <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={() => openUpdateStock(item)} sx={{ borderRadius: '10px', fontWeight: 800 }}>
                          Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <ShowMoreFooter paged={paged} label="medicines" />
          </>
        )}
      </Card>

      {/* Add Stock Dialog */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { ...dialogPaperSx, m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } }}>
        <form onSubmit={handleStockSubmit}>
          <DialogTitle sx={{ pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 42, height: 42, borderRadius: '12px', bgcolor: '#FFEDD5', color: ORANGE_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Package size={20} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.05rem' }}>{isUpdating ? 'Update shelf stock' : 'Log shelf stock'}</Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.8rem' }}>Set the current quantity on your shelf</Typography>
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            <Autocomplete
              options={medicines}
              value={selectedMedicine}
              isOptionEqualToValue={(a, b) => a?._id === b?._id}
              onChange={(event, med) => setForm({ ...form, medicineId: med?._id || '' })}
              getOptionLabel={(option) => option?.name ? `${option.name}${option.genericName ? ` (${option.genericName})` : ''}` : ''}
              renderInput={(params) => <TextField {...params} required label="Medicine" placeholder="Search catalog..." />}
            />
            <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: ORANGE_DARK, mb: 0.8, letterSpacing: '0.4px' }}>SHELF QTY</Typography>
              <QtyStepper
                min={0}
                value={form.quantity}
                onChange={(quantity) => setForm({ ...form, quantity })}
                presets={[5, 10, 25, 50]}
              />
            </Box>
            <TextField
              fullWidth
              label="Batch number"
              value={form.batchNumber}
              onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 1, gap: 1 }}>
            <Button onClick={() => setOpenModal(false)} sx={{ color: 'text.secondary', fontWeight: 700 }}>Cancel</Button>
            <Button type="submit" variant="contained" color="secondary" sx={{ fontWeight: 800, px: 3 }}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <InventoryUploadDialog open={openUpload} onClose={() => setOpenUpload(false)} mode="store" onUploaded={fetchInventory} />
    </Box>
  );
};

export default StoreInventoryPage;
