import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, Button, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Drawer, Divider, IconButton
} from '@mui/material';
import { Users, Plus, Phone, History, RefreshCw, X } from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PageHeader, EmptyState, dialogPaperSx, statusChipClass } from '../../components/admin/AdminChrome';
import FilterBar, { usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { limitPhone, phoneError, emailError, requiredText, firstError, phoneFieldProps } from '../../utils/validation';

const emptyCustomer = { name: '', phone: '', email: '', address: '', notes: '', status: 'Active' };

const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState('ALL');
  const [sortBy, setSortBy] = useState('name');
  const [openAddModal, setOpenAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerRequests, setCustomerRequests] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [triedCustomer, setTriedCustomer] = useState(false);

  const customerErrors = {
    phone: phoneError(newCustomer.phone, true),
    name: requiredText(newCustomer.name, 'Full name'),
    email: emailError(newCustomer.email)
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers');
      setCustomers(res.data || []);
    } catch (err) {
      console.error('API fetch error for customers:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchCustomers);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setTriedCustomer(true);
    const err = firstError(...Object.values(customerErrors));
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await api.post('/customers', newCustomer);
      toast.success('Customer profile registered successfully');
      setOpenAddModal(false);
      setTriedCustomer(false);
      setNewCustomer(emptyCustomer);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create customer');
    }
  };

  const handleOpenHistory = async (cust) => {
    setSelectedCustomer(cust);
    setHistoryDrawerOpen(true);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/customers/${cust._id}/history`);
      setCustomerRequests(res.data?.requests || []);
    } catch (err) {
      console.error('Error loading customer history:', err);
      setCustomerRequests([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredCustomers = (customers || []).filter((c) => {
    const term = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.phone || '').includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.address || '').toLowerCase().includes(term)
    ) && (quick === 'ALL' || (c.status || 'Active') === quick);
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const paged = usePagedList(filteredCustomers, 12, `${search}|${quick}|${sortBy}`);

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.status === 'Active' || c.status === 'VIP').length;
  const vipCustomers = customers.filter((c) => c.status === 'VIP').length;
  const plainActive = customers.filter((c) => (c.status || 'Active') === 'Active').length;
  const inactiveCustomers = customers.filter((c) => c.status === 'Inactive').length;

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Users size={26} />}
        title="Customers"
        subtitle="Patient directory, contact details, and requisition history."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchCustomers} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>Refresh</Button>
            <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => { setNewCustomer(emptyCustomer); setTriedCustomer(false); setOpenAddModal(true); }} sx={{ borderRadius: '12px', fontWeight: 800 }}>Add customer</Button>
          </>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', mb: { xs: 1.5, md: 0 } }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search name, phone, email, address..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: totalCustomers },
              { value: 'Active', label: 'Active', count: plainActive },
              { value: 'VIP', label: 'VIP', count: vipCustomers },
              ...(inactiveCustomers ? [{ value: 'Inactive', label: 'Inactive', count: inactiveCustomers }] : [])
            ]}
            quickValue={quick}
            onQuickChange={setQuick}
            sort={{
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'name', label: 'Name: A to Z' },
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' }
              ]
            }}
            resultCount={filteredCustomers.length}
            resultLabel="customers"
          />
        </Box>

        <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : filteredCustomers.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="No customers yet" text="Profiles appear here when you add them, or when a store submits a requisition." />
          ) : paged.visible.map((cust) => (
            <Box key={cust._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{cust.name}</Typography>
                <Chip label={cust.status || 'Active'} size="small" sx={{ bgcolor: cust.status === 'VIP' ? '#FEF3C7' : '#DCFCE7', color: cust.status === 'VIP' ? '#92400E' : '#166534', fontWeight: 800 }} />
              </Box>
              <Typography sx={{ color: '#0D9488', fontWeight: 700, fontSize: '0.8rem', mt: 0.5 }}>{cust.phone}</Typography>
              <Button size="small" startIcon={<History size={14} />} onClick={() => handleOpenHistory(cust)} sx={{ mt: 1, fontWeight: 800 }}>History</Button>
            </Box>
          ))}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Address / email</TableCell>
                <TableCell align="center">Requests</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState icon={<Users size={22} />} title="No customers yet" text="Profiles appear here when you add them, or when a store submits a requisition." />
                  </TableCell>
                </TableRow>
              ) : paged.visible.map((cust) => (
                <TableRow key={cust._id} hover>
                  <TableCell sx={{ fontWeight: 800 }}>{cust.name}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#0D9488' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}><Phone size={14} /> {cust.phone}</Box>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{cust.address || 'N/A'}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{cust.email || 'No email'}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={`${cust.totalRequests || 0} orders`} size="small" sx={{ bgcolor: '#F1F5F9', fontWeight: 800 }} />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={cust.status || 'Active'} size="small" sx={{ bgcolor: cust.status === 'VIP' ? '#FEF3C7' : '#DCFCE7', color: cust.status === 'VIP' ? '#92400E' : '#166534', fontWeight: 800 }} />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" startIcon={<History size={15} />} onClick={() => handleOpenHistory(cust)} sx={{ borderRadius: '8px', fontWeight: 800 }}>
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && <ShowMoreFooter paged={paged} label="customers" />}
      </Card>

      <Dialog open={openAddModal} onClose={() => setOpenAddModal(false)} maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleAddSubmit}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Add customer</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'grid', gap: 2, mt: 0.5 }}>
              <TextField fullWidth required autoFocus label="Phone" placeholder="9876543210" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: limitPhone(e.target.value) })} error={Boolean(newCustomer.phone && customerErrors.phone) || (triedCustomer && Boolean(customerErrors.phone))} helperText={customerErrors.phone || '10-digit mobile'} slotProps={{ htmlInput: phoneFieldProps }} />
              <TextField fullWidth required label="Full name" placeholder="Rahul Sharma" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} error={triedCustomer && Boolean(customerErrors.name)} helperText={triedCustomer ? customerErrors.name : ''} />
              <TextField fullWidth label="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} error={Boolean(customerErrors.email)} helperText={customerErrors.email} />
              <TextField fullWidth label="Address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
              <TextField fullWidth multiline minRows={2} label="Notes" value={newCustomer.notes} onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenAddModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ fontWeight: 800 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Drawer anchor="right" open={historyDrawerOpen} onClose={() => setHistoryDrawerOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{selectedCustomer?.name}</Typography>
            <Typography sx={{ color: '#64748B', fontSize: '0.8rem' }}>{selectedCustomer?.phone} · requisition history</Typography>
          </Box>
          <IconButton onClick={() => setHistoryDrawerOpen(false)}><X size={20} /></IconButton>
        </Box>
        <Divider sx={{ mb: 2.5 }} />
        {loadingHistory ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : customerRequests.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="No requisitions" text="This customer has no medicine requests yet." />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {customerRequests.map((req) => (
              <Card key={req._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: 'none' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.6 }}>
                  <Typography sx={{ fontWeight: 800, color: '#0F766E', fontSize: '0.82rem' }}>{req.requestId}</Typography>
                  <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>{req.productName || req.medicineName}</Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.75rem', mt: 0.4 }}>
                  Qty {req.quantity}{req.createdAt ? ` · ${format(new Date(req.createdAt), 'dd MMM yyyy, h:mm a')}` : ''}
                </Typography>
              </Card>
            ))}
          </Box>
        )}
      </Drawer>
    </Box>
  );
};

export default CustomersPage;
