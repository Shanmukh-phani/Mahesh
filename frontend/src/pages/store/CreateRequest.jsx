import React, { useState, useEffect, useContext, useRef } from 'react';
import { 
  Box, Typography, Card, TextField, Button, Autocomplete, CircularProgress, Chip, MenuItem, Select
} from '@mui/material';
import { PlusCircle, ArrowLeft, Send, User, Package, Clock, Store, MessageSquare } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { format } from 'date-fns';
import { QtyStepper } from '../../components/admin/AdminChrome';
import { limitPhone, phoneError, requiredText, qtyError, firstError, phoneFieldProps } from '../../utils/validation';

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const SectionTitle = ({ step, icon, title, hint }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
    <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: '#FFF7ED', color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
      {step}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {icon} {title}
      </Typography>
      {hint && <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>{hint}</Typography>}
    </Box>
  </Box>
);

const SessionItem = ({ icon, label, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minWidth: 0 }}>
    <Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: '#FFF7ED', color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography sx={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', mb: 0.3 }}>{label}</Typography>
      {children}
    </Box>
  </Box>
);

const CreateRequest = () => {
  const { user } = useContext(AuthContext);
  const [medicines, setMedicines] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [productName, setProductName] = useState('');

  // Store employees list
  const [storeEmployees, setStoreEmployees] = useState([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState(user?.name || '');
  
  const [formData, setFormData] = useState({
    composition: '',
    quantity: 1,
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    comments: ''
  });
  
  const [submitting, setSubmitting] = useState(false);
  const lastLookup = useRef('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoadingMeds(true);
      try {
        const [medRes, empRes] = await Promise.all([
          api.get('/medicines'),
          api.get('/employees/my-store').catch(() => ({ data: [] }))
        ]);
        setMedicines(medRes.data || []);
        const empList = empRes.data || [];
        setStoreEmployees(empList);
        if (empList.length > 0 && !selectedEmployeeName) {
          setSelectedEmployeeName(empList[0].employeeName);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingMeds(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const phone = String(formData.customerPhone || '').trim();
    if (phone.length !== 10 || lastLookup.current === phone) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/customers?search=${encodeURIComponent(phone)}`);
        const match = (res.data || []).find((c) => String(c.phone) === phone);
        if (match) {
          lastLookup.current = phone;
          setFormData((prev) => ({
            ...prev,
            customerName: match.name || prev.customerName,
            customerAddress: match.address || prev.customerAddress
          }));
          toast.success(`Found ${match.name}`);
        }
      } catch (err) {
        console.error(err);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [formData.customerPhone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalProdName = (typeof selectedMed === 'string') ? selectedMed : (selectedMed ? selectedMed.name : productName);

    const err = firstError(
      !finalProdName ? 'Please select or type a product name' : '',
      qtyError(formData.quantity, 1),
      phoneError(formData.customerPhone, true),
      requiredText(formData.customerName, 'Customer name')
    );
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/requests', {
        productName: finalProdName,
        medicineName: finalProdName,
        composition: formData.composition || (selectedMed?.category ? `Category: ${selectedMed.category}` : ''),
        quantity: Number(formData.quantity),
        employeeName: selectedEmployeeName || user?.name,
        customer: {
          name: formData.customerName,
          phone: formData.customerPhone,
          address: formData.customerAddress
        },
        comments: formData.comments
      });
      toast.success('Medicine request submitted successfully');
      navigate('/store/requests');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const todayDateStr = format(new Date(), 'dd MMMM yyyy, h:mm a');
  const storeCodeDisplay = user?.storeCode || user?.store?.storeCode || (typeof user?.storeId === 'string' ? user.storeId : 'AP20');
  const storeNameDisplay = user?.store?.storeName || user?.name || 'Mini Store Branch';

  const sectionCardSx = { p: { xs: 2, sm: 2.5, md: 3 }, borderRadius: '18px', mb: { xs: 2, md: 2.5 } };

  return (
    <Box sx={{ maxWidth: '980px', mx: 'auto' }} className="animate-fade-in">
      <Button
        startIcon={<ArrowLeft size={18} />}
        onClick={() => navigate('/store')}
        sx={{ mb: 2, fontWeight: 700, color: '#64748B', '&:hover': { bgcolor: '#FFF7ED', color: ORANGE_DARK } }}
      >
        Back to Dashboard
      </Button>

      {/* Header with store session */}
      <Card className="white-card" sx={{ p: { xs: 2.25, sm: 3 }, mb: { xs: 2, md: 2.5 }, borderRadius: '18px', borderLeft: `4px solid ${ORANGE} !important` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.25 }}>
          <Box sx={{ p: 1.2, bgcolor: '#FFF7ED', color: ORANGE, borderRadius: '12px', display: 'flex', flexShrink: 0 }}>
            <PlusCircle size={24} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight="800" color="#0F172A" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, lineHeight: 1.2 }}>New requisition</Typography>
            <Typography sx={{ color: '#64748B', fontSize: { xs: '0.82rem', md: '0.9rem' } }}>Medicine, quantity and customer phone are enough.</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1.4fr 1fr' }, gap: 2, p: { xs: 1.75, md: 2 }, borderRadius: '14px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <SessionItem icon={<Clock size={16} />} label="System date">
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>{todayDateStr}</Typography>
          </SessionItem>

          <SessionItem icon={<User size={16} />} label="Employee name">
            {storeEmployees.length > 0 && storeEmployees.length <= 6 ? (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {storeEmployees.map((emp) => {
                  const active = selectedEmployeeName === emp.employeeName;
                  return (
                    <Chip
                      key={emp._id || emp.employeeName}
                      label={emp.employeeName}
                      size="small"
                      onClick={() => setSelectedEmployeeName(emp.employeeName)}
                      sx={{
                        fontWeight: 800,
                        borderRadius: '8px',
                        bgcolor: active ? ORANGE : '#FFFFFF',
                        color: active ? '#FFFFFF' : '#475569',
                        border: `1px solid ${active ? ORANGE : '#E2E8F0'}`,
                        '&:hover': { bgcolor: active ? ORANGE_DARK : '#FFF7ED' }
                      }}
                    />
                  );
                })}
              </Box>
            ) : storeEmployees.length > 6 ? (
              <Select
                size="small"
                fullWidth
                value={selectedEmployeeName}
                onChange={(e) => setSelectedEmployeeName(e.target.value)}
                sx={{ bgcolor: 'white', fontWeight: 800, height: 34, fontSize: '0.85rem' }}
              >
                {storeEmployees.map(emp => (
                  <MenuItem key={emp._id} value={emp.employeeName}>
                    {emp.employeeName} ({emp.designation})
                  </MenuItem>
                ))}
              </Select>
            ) : (
              <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>{selectedEmployeeName || user?.name || 'Store Staff'}</Typography>
            )}
          </SessionItem>

          <SessionItem icon={<Store size={16} />} label="Store ID">
            <Chip label={`${storeCodeDisplay} • ${storeNameDisplay}`} size="small" sx={{ bgcolor: '#FFF7ED', color: ORANGE_DARK, fontWeight: 800, fontSize: '0.75rem', maxWidth: '100%' }} />
          </SessionItem>
        </Box>
      </Card>

      <form onSubmit={handleSubmit}>
        {/* Section 1: Medicine */}
        <Card className="white-card" sx={sectionCardSx}>
          <SectionTitle step={1} icon={<Package size={17} color={ORANGE} />} title="Medicine" hint="Pick from the catalog or type a new name" />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Autocomplete
                options={medicines}
                getOptionLabel={(option) => typeof option === 'string' ? option : `${option.name} (${option.genericName || ''})`}
                loading={loadingMeds}
                value={selectedMed}
                onChange={(event, newValue) => {
                  setSelectedMed(newValue);
                  if (newValue && typeof newValue === 'object') {
                    setProductName(newValue.name);
                    if (!formData.composition && newValue.genericName) {
                      setFormData(prev => ({ ...prev, composition: newValue.genericName }));
                    }
                  }
                }}
                freeSolo
                onInputChange={(event, newInputValue) => {
                  setProductName(newInputValue);
                }}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    required 
                    label="Product name" 
                    placeholder="Search or type medicine..."
                  />
                )}
              />
              <TextField
                fullWidth
                label="Composition"
                placeholder="Auto-filled from catalog"
                value={formData.composition}
                onChange={(e) => setFormData({ ...formData, composition: e.target.value })}
              />
            </Box>
            <Box sx={{ p: 1.75, borderRadius: '14px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: ORANGE_DARK, mb: 0.8, letterSpacing: '0.4px' }}>QUANTITY</Typography>
              <QtyStepper
                value={formData.quantity}
                onChange={(quantity) => setFormData({ ...formData, quantity })}
                presets={[1, 5, 10, 20]}
              />
            </Box>
          </Box>
        </Card>

        {/* Section 2: Customer */}
        <Card className="white-card" sx={sectionCardSx}>
          <SectionTitle step={2} icon={<User size={17} color={ORANGE} />} title="Customer" hint="Saved customers fill in automatically from the phone number" />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
            <TextField
              fullWidth
              required
              label="Phone"
              placeholder="9876543210"
              value={formData.customerPhone}
              onChange={(e) => setFormData({ ...formData, customerPhone: limitPhone(e.target.value) })}
              error={Boolean(phoneError(formData.customerPhone, true) && formData.customerPhone)}
              helperText={phoneError(formData.customerPhone) || '10-digit mobile. Name fills in if saved'}
              slotProps={{ htmlInput: phoneFieldProps }}
            />
            <TextField
              fullWidth
              required
              label="Name"
              placeholder="Rahul Sharma"
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
            />
            <TextField
              fullWidth
              label="Address"
              placeholder="Area / landmark"
              value={formData.customerAddress}
              onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
              sx={{ gridColumn: { sm: '1 / -1' } }}
            />
          </Box>
        </Card>

        {/* Section 3: Note */}
        <Card className="white-card" sx={sectionCardSx}>
          <SectionTitle step={3} icon={<MessageSquare size={17} color={ORANGE} />} title="Note for warehouse" hint="Optional" />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Note for warehouse"
            placeholder="Urgency or delivery note..."
            value={formData.comments}
            onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
          />
        </Card>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, flexDirection: { xs: 'column-reverse', sm: 'row' }, mb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/store')}
            sx={{ borderRadius: '12px', fontWeight: 800, px: 3, py: 1.2 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="secondary"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <Send size={18} />}
            sx={{ 
              borderRadius: '12px', 
              px: 4, 
              py: 1.3, 
              fontWeight: 800
            }}
          >
            Submit Requisition
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default CreateRequest;
