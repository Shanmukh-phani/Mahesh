import React, { useEffect, useState, useRef } from 'react';
import { 
  Box, Typography, Card, TextField, Chip, Button, 
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Search, Package, PlusCircle, Pill } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { QtyStepper, dialogPaperSx, PageHeader } from '../../components/admin/AdminChrome';
import FilterBar, { usePagedList } from '../../components/FilterBar';
import { limitPhone, phoneError, requiredText, qtyError, firstError, phoneFieldProps } from '../../utils/validation';

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const SearchMedicine = () => {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const navigate = useNavigate();

  // Quick Request Modal State
  const [selectedMed, setSelectedMed] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    quantity: 1,
    customerName: '',
    customerPhone: '',
    customerEmail: ''
  });
  const lastLookup = useRef('');

  const fetchMedicines = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/medicines?search=${encodeURIComponent(search)}`);
      setMedicines(res.data);
    } catch (err) {
      toast.error('Failed to search medicines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, [search]);

  const categories = ['ALL', 'Pain Relief', 'Antibiotic', 'Allergy', 'Antacid', 'Vitamins', 'Cardiology', 'Diabetes'];

  const [sortBy, setSortBy] = useState('name');

  const filteredMedicines = medicines.filter(med => {
    if (categoryFilter === 'ALL') return true;
    return med.category === categoryFilter;
  }).sort((a, b) => {
    const cmp = String(a.name || '').localeCompare(String(b.name || ''));
    return sortBy === 'nameDesc' ? -cmp : cmp;
  });

  const categoryCount = (cat) => (cat === 'ALL' ? medicines.length : medicines.filter((m) => m.category === cat).length);
  const quickCategories = ['ALL', ...categories.slice(1).filter((c) => categoryCount(c) > 0).slice(0, 4)];
  if (categoryFilter !== 'ALL' && !quickCategories.includes(categoryFilter)) quickCategories.push(categoryFilter);

  const paged = usePagedList(filteredMedicines, 12, `${search}|${categoryFilter}|${sortBy}`);

  const handleOpenRequestModal = (med) => {
    setSelectedMed(med);
    lastLookup.current = '';
    setRequestForm({ quantity: 1, customerName: '', customerPhone: '', customerEmail: '' });
    setOpenModal(true);
  };

  useEffect(() => {
    if (!openModal) return undefined;
    const phone = String(requestForm.customerPhone || '').trim();
    if (phone.length !== 10 || lastLookup.current === phone) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/customers?search=${encodeURIComponent(phone)}`);
        const match = (res.data || []).find((c) => String(c.phone) === phone);
        if (match) {
          lastLookup.current = phone;
          setRequestForm((prev) => ({
            ...prev,
            customerName: match.name || prev.customerName
          }));
          toast.success(`Found ${match.name}`);
        }
      } catch (err) {
        console.error(err);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [openModal, requestForm.customerPhone]);

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    const err = firstError(
      qtyError(requestForm.quantity, 1),
      phoneError(requestForm.customerPhone, true),
      requiredText(requestForm.customerName, 'Customer name')
    );
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await api.post('/requests', {
        medicineId: selectedMed._id,
        medicineName: selectedMed.name,
        quantity: Number(requestForm.quantity),
        customer: {
          name: requestForm.customerName,
          phone: requestForm.customerPhone,
          email: requestForm.customerEmail
        }
      });
      toast.success(`Request submitted for ${selectedMed.name}`);
      setOpenModal(false);
      navigate('/store/requests');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit request');
    }
  };

  return (
    <Box sx={{ maxWidth: '1400px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Search size={26} />}
        title="Search Medicine Catalog"
        subtitle="Look up medicines in the main warehouse catalog and request them for your branch."
        actions={(
          <Button
            variant="outlined"
            startIcon={<PlusCircle size={18} />}
            onClick={() => navigate('/store/create-request')}
            sx={{ borderRadius: '12px', fontWeight: 800 }}
          >
            Custom request
          </Button>
        )}
      />

      {/* Search, quick categories, more filters */}
      <Card className="white-card" sx={{ p: { xs: 1.75, md: 2.25 }, mb: { xs: 2, md: 2.5 }, borderRadius: '18px' }}>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search by brand name, generic formula or ingredient..."
          quickFilters={quickCategories.map((cat) => ({ value: cat, label: cat === 'ALL' ? 'All' : cat, count: categoryCount(cat) }))}
          quickValue={categoryFilter}
          onQuickChange={setCategoryFilter}
          filters={[
            {
              key: 'category',
              label: 'Category',
              value: categoryFilter,
              defaultValue: 'ALL',
              options: categories.map((c) => ({ value: c, label: c === 'ALL' ? 'All categories' : c })),
              onChange: setCategoryFilter
            }
          ]}
          sort={{
            value: sortBy,
            onChange: setSortBy,
            options: [
              { value: 'name', label: 'Name: A to Z' },
              { value: 'nameDesc', label: 'Name: Z to A' }
            ]
          }}
          resultCount={loading ? undefined : filteredMedicines.length}
          resultLabel="medicines"
        />
      </Card>

      {/* Medicines Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      ) : filteredMedicines.length === 0 ? (
        <Card className="white-card" sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', borderRadius: '18px' }}>
          <Box sx={{ width: 60, height: 60, borderRadius: '18px', bgcolor: '#FFF7ED', color: ORANGE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
            <Package size={28} />
          </Box>
          <Typography variant="h6" fontWeight="800" color="#0F172A">No medicines found</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 420, mx: 'auto' }}>
            {search ? `No results match "${search}".` : 'No medicines in this category.'} You can still request a custom medicine manually.
          </Typography>
          <Button 
            variant="contained" 
            color="secondary"
            startIcon={<PlusCircle size={18} />}
            onClick={() => navigate('/store/create-request')}
            sx={{ borderRadius: '12px', fontWeight: 800 }}
          >
            Create Custom Request
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: { xs: 1.5, md: 2.25 } }}>
          {paged.visible.map((med) => (
            <Card
              key={med._id}
              className="white-card white-card-hover"
              sx={{ p: { xs: 2, md: 2.25 }, borderRadius: '18px', height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, position: 'relative', overflow: 'hidden', transition: 'all 0.2s ease', '&:hover': { borderColor: '#FED7AA' } }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: '#FFF7ED', color: ORANGE_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Pill size={22} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem', lineHeight: 1.3, wordBreak: 'break-word' }}>{med.name}</Typography>
                  {med.genericName && (
                    <Typography sx={{ color: '#64748B', fontSize: '0.82rem', mt: 0.25, wordBreak: 'break-word' }}>{med.genericName}</Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <Chip 
                  label={med.category || 'General'} 
                  size="small" 
                  sx={{ bgcolor: '#FFF7ED', color: ORANGE_DARK, fontWeight: 800, fontSize: '0.7rem', border: '1px solid #FED7AA' }} 
                />
              </Box>

              {med.description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                  {med.description}
                </Typography>
              )}

              <Button
                fullWidth
                variant="contained"
                color="secondary"
                startIcon={<PlusCircle size={16} />}
                onClick={() => handleOpenRequestModal(med)}
                sx={{ mt: 'auto', borderRadius: '12px', fontWeight: 800, py: 1 }}
              >
                Request Medicine
              </Button>
            </Card>
          ))}
        </Box>
      )}

      {!loading && paged.hasMore && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mt: 3 }}>
          <Typography sx={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 700 }}>
            Showing {paged.shown} of {paged.total} medicines
          </Typography>
          <Button variant="outlined" onClick={paged.showMore} sx={{ borderRadius: '12px', fontWeight: 800, px: 4 }}>
            Load more
          </Button>
        </Box>
      )}

      {/* Quick Request Dialog */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { ...dialogPaperSx, m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } }}>
        <form onSubmit={handleRequestSubmit}>
          <DialogTitle sx={{ pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 42, height: 42, borderRadius: '12px', bgcolor: '#FFEDD5', color: ORANGE_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Pill size={20} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.05rem', lineHeight: 1.25, wordBreak: 'break-word' }}>Request {selectedMed?.name}</Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.8rem' }}>{selectedMed?.genericName || 'Warehouse catalog'}</Typography>
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: ORANGE_DARK, mb: 0.8, letterSpacing: '0.4px' }}>QUANTITY</Typography>
              <QtyStepper
                value={requestForm.quantity}
                onChange={(quantity) => setRequestForm({ ...requestForm, quantity })}
                presets={[1, 5, 10, 20]}
              />
            </Box>
            <TextField
              fullWidth
              required
              autoFocus
              label="Phone"
              placeholder="9876543210"
              value={requestForm.customerPhone}
              onChange={(e) => setRequestForm({ ...requestForm, customerPhone: limitPhone(e.target.value) })}
              error={Boolean(phoneError(requestForm.customerPhone) || (requestForm.customerPhone && phoneError(requestForm.customerPhone, true)))}
              helperText={phoneError(requestForm.customerPhone) || '10-digit mobile. Name fills in if saved'}
              slotProps={{ htmlInput: phoneFieldProps }}
            />
            <TextField
              fullWidth
              required
              label="Customer name"
              value={requestForm.customerName}
              onChange={(e) => setRequestForm({ ...requestForm, customerName: e.target.value })}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 1, gap: 1 }}>
            <Button onClick={() => setOpenModal(false)} sx={{ color: 'text.secondary', fontWeight: 700 }}>Cancel</Button>
            <Button type="submit" variant="contained" color="secondary" sx={{ fontWeight: 800, px: 3 }}>
              Submit request
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default SearchMedicine;
