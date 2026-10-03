import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, Button, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Switch, IconButton
} from '@mui/material';
import { Store, Plus, Phone, MapPin, RefreshCw, Eye, Trash2, Users } from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import toast from 'react-hot-toast';
import StoreDetailsModal from '../../components/StoreDetailsModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PageHeader, EmptyState, dialogPaperSx, ChoiceChips } from '../../components/admin/AdminChrome';
import FilterBar, { usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { limitPhone, phoneError, emailError, storeIdError, requiredText, passwordError, firstError, phoneFieldProps } from '../../utils/validation';

const emptyStore = {
  storeName: '',
  storeCode: '',
  storeAddress: '',
  storePhone: '',
  storeEmail: '',
  managerName: '',
  managerPhone: '',
  managerEmail: '',
  status: 'Active',
  username: '',
  password: 'store123'
};

const MiniStoresPage = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState('ALL');
  const [sortBy, setSortBy] = useState('code');
  const [openAddModal, setOpenAddModal] = useState(false);
  const [newStore, setNewStore] = useState(emptyStore);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteStore, setDeleteStore] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [triedStore, setTriedStore] = useState(false);

  const fetchStores = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stores');
      setStores(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load mini stores');
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchStores);

  useEffect(() => {
    fetchStores();
  }, []);

  const storeErrors = {
    storeCode: storeIdError(newStore.storeCode),
    storeName: requiredText(newStore.storeName, 'Store name'),
    storePhone: phoneError(newStore.storePhone),
    storeEmail: emailError(newStore.storeEmail),
    managerPhone: phoneError(newStore.managerPhone),
    managerEmail: emailError(newStore.managerEmail),
    password: passwordError(newStore.password || 'store123')
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    setTriedStore(true);
    const err = firstError(...Object.values(storeErrors));
    if (err) {
      toast.error(err);
      return;
    }
    try {
      const loginPassword = (newStore.password || '').trim() || 'store123';
      const payload = {
        ...newStore,
        location: newStore.storeAddress,
        phone: newStore.storePhone,
        email: newStore.storeEmail,
        contactPerson: newStore.managerName,
        username: newStore.username || newStore.storeCode,
        password: loginPassword
      };
      await api.post('/stores', payload);
      const loginId = payload.username || payload.storeCode;
      toast.success(`Store created. Login with ${loginId} / ${loginPassword}`);
      setOpenAddModal(false);
      setTriedStore(false);
      setNewStore(emptyStore);
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create mini store');
    }
  };

  const handleToggleStatus = async (store) => {
    try {
      const currentStatus = store.status === 'Active' ? 'Active' : 'Inactive';
      const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
      await api.put(`/stores/${store._id}`, { status: newStatus });
      toast.success(`Store ${store.storeName} is now ${newStatus}`);
      setStores((prev) => prev.map((s) => (s._id === store._id ? { ...s, status: newStatus, isActive: newStatus === 'Active' } : s)));
    } catch (err) {
      toast.error('Failed to update store status');
    }
  };

  const handleDeleteStore = async () => {
    if (!deleteStore) return;
    setDeleting(true);
    try {
      await api.delete(`/stores/${deleteStore._id}`);
      toast.success(`Store ${deleteStore.storeName} deleted`);
      setDeleteStore(null);
      fetchStores();
    } catch (err) {
      toast.error('Failed to delete store');
    } finally {
      setDeleting(false);
    }
  };

  const isStoreActive = (st) => (st.status ? st.status === 'Active' : st.isActive !== false);

  const filteredStores = (stores || []).filter((s) => {
    const term = search.toLowerCase();
    return (
      (s.storeName || '').toLowerCase().includes(term) ||
      (s.storeCode || '').toLowerCase().includes(term) ||
      (s.location || s.storeAddress || '').toLowerCase().includes(term) ||
      (s.contactPerson || s.managerName || '').toLowerCase().includes(term) ||
      (s.username || '').toLowerCase().includes(term)
    ) && (quick === 'ALL' || (quick === 'ACTIVE' ? isStoreActive(s) : !isStoreActive(s)));
  }).sort((a, b) => {
    if (sortBy === 'name') return String(a.storeName || '').localeCompare(String(b.storeName || ''));
    if (sortBy === 'staff') return Number(b.totalEmployees || 0) - Number(a.totalEmployees || 0);
    if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    return String(a.storeCode || '').localeCompare(String(b.storeCode || ''), undefined, { numeric: true });
  });

  const paged = usePagedList(filteredStores, 10, `${search}|${quick}|${sortBy}`);

  const totalStores = stores.length;
  const activeStoresCount = stores.filter((s) => s.status === 'Active' || s.isActive !== false).length;
  const totalEmployeesCount = stores.reduce((acc, s) => acc + (s.totalEmployees || 0), 0);
  const activeCount = stores.filter(isStoreActive).length;

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Store size={26} />}
        title="Mini stores"
        subtitle="Branch details, login credentials, and staff for every mini store."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchStores} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>Refresh</Button>
            <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => { setNewStore(emptyStore); setTriedStore(false); setOpenAddModal(true); }} sx={{ borderRadius: '12px', fontWeight: 800 }}>Add mini store</Button>
          </>
        )}
      />

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9', mb: { xs: 1.5, lg: 0 } }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search store ID, name, manager, location..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: totalStores },
              { value: 'ACTIVE', label: 'Active', count: activeCount },
              { value: 'INACTIVE', label: 'Inactive', count: totalStores - activeCount }
            ]}
            quickValue={quick}
            onQuickChange={setQuick}
            sort={{
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'code', label: 'Store ID' },
                { value: 'name', label: 'Name: A to Z' },
                { value: 'staff', label: 'Most staff' },
                { value: 'newest', label: 'Newest first' }
              ]
            }}
            resultCount={filteredStores.length}
            resultLabel={`stores · ${totalEmployeesCount} staff`}
          />
        </Box>

        <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : filteredStores.length === 0 ? (
            <EmptyState icon={<Store size={22} />} title="No mini stores yet" text='Click "Add mini store" to create the first branch and login.' />
          ) : paged.visible.map((st) => (
            <Box key={st._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                <Chip label={st.storeCode} size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }} />
                <Switch checked={st.status === 'Active'} onChange={() => handleToggleStatus(st)} color="primary" size="small" />
              </Box>
              <Typography sx={{ fontWeight: 800 }}>{st.storeName}</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mt: 0.4 }}>{st.location || st.storeAddress || 'No address'} · {st.username || st.storeCode}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
                <Button size="small" variant="contained" color="primary" startIcon={<Eye size={14} />} onClick={() => { setSelectedStoreId(st._id); setDetailsModalOpen(true); }} sx={{ fontWeight: 800 }}>Details</Button>
                <IconButton size="small" color="error" onClick={() => setDeleteStore(st)}><Trash2 size={16} /></IconButton>
              </Box>
            </Box>
          ))}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', lg: 'block' } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Store ID</TableCell>
                <TableCell>Store</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell>Login ID</TableCell>
                <TableCell align="center">Staff</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
              ) : filteredStores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState icon={<Store size={22} />} title="No mini stores yet" text='Click "Add mini store" to create the first branch and login.' />
                  </TableCell>
                </TableRow>
              ) : paged.visible.map((st) => (
                <TableRow key={st._id} hover>
                  <TableCell><Chip label={st.storeCode} size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }} /></TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.88rem' }}>{st.storeName}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#64748B', fontSize: '0.75rem', mt: 0.3 }}>
                      <MapPin size={13} color="#0D9488" /> {st.location || st.storeAddress || 'Address not specified'}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{st.contactPerson || st.managerName || 'Branch Manager'}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#64748B', fontSize: '0.75rem' }}>
                      <Phone size={12} /> {st.managerPhone || st.phone || 'N/A'}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#0F766E' }}>{st.username || st.storeCode}</TableCell>
                  <TableCell align="center">
                    <Chip label={`${st.totalEmployees || 0} staff`} size="small" sx={{ bgcolor: '#CCFBF1', color: '#0F766E', fontWeight: 800 }} />
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={st.status === 'Active'} onChange={() => handleToggleStatus(st)} color="primary" size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button size="small" variant="contained" color="primary" startIcon={<Eye size={15} />} onClick={() => { setSelectedStoreId(st._id); setDetailsModalOpen(true); }} sx={{ borderRadius: '8px', fontWeight: 800 }}>
                        Details
                      </Button>
                      <IconButton size="small" color="error" onClick={() => setDeleteStore(st)}><Trash2 size={16} /></IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && <ShowMoreFooter paged={paged} label="stores" />}
      </Card>

      <Dialog open={openAddModal} onClose={() => setOpenAddModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleCreateStore}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Add mini store</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: '#64748B', fontSize: '0.82rem', mb: 2 }}>Store ID uses AP + 2 or 3 digits, like AP20 or AP201.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                fullWidth
                required
                autoFocus
                label="Store ID"
                placeholder="AP20"
                error={Boolean((triedStore || newStore.storeCode) && storeErrors.storeCode)}
                helperText={(triedStore || newStore.storeCode) && storeErrors.storeCode ? storeErrors.storeCode : 'AP + 2 or 3 digits (AP20, AP21, AP201)'}
                value={newStore.storeCode}
                onChange={(e) => {
                  let code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  if (/^\d{1,3}$/.test(code)) code = `AP${code}`;
                  setNewStore((prev) => ({
                    ...prev,
                    storeCode: code,
                    username: !prev.username || prev.username === prev.storeCode ? code : prev.username
                  }));
                }}
              />
              <TextField fullWidth required label="Store name" placeholder="e.g. Hitech City branch" error={triedStore && Boolean(storeErrors.storeName)} helperText={triedStore ? storeErrors.storeName : ''} value={newStore.storeName} onChange={(e) => setNewStore({ ...newStore, storeName: e.target.value })} />
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>STATUS</Typography>
                <ChoiceChips options={['Active', 'Inactive']} value={newStore.status} onChange={(status) => setNewStore({ ...newStore, status })} />
              </Box>
              <TextField fullWidth label="Address" value={newStore.storeAddress} onChange={(e) => setNewStore({ ...newStore, storeAddress: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <TextField fullWidth label="Store phone" placeholder="9876543210" value={newStore.storePhone} onChange={(e) => setNewStore({ ...newStore, storePhone: limitPhone(e.target.value) })} error={Boolean(storeErrors.storePhone)} helperText={storeErrors.storePhone || '10-digit mobile'} slotProps={{ htmlInput: phoneFieldProps }} />
              <TextField fullWidth label="Store email" placeholder="branch@store.com" value={newStore.storeEmail} onChange={(e) => setNewStore({ ...newStore, storeEmail: e.target.value })} error={Boolean(storeErrors.storeEmail)} helperText={storeErrors.storeEmail} />
              <TextField fullWidth label="Manager name" value={newStore.managerName} onChange={(e) => setNewStore({ ...newStore, managerName: e.target.value })} />
              <TextField fullWidth label="Manager phone" placeholder="9876543210" value={newStore.managerPhone} onChange={(e) => setNewStore({ ...newStore, managerPhone: limitPhone(e.target.value) })} error={Boolean(storeErrors.managerPhone)} helperText={storeErrors.managerPhone || '10-digit mobile'} slotProps={{ htmlInput: phoneFieldProps }} />
              <TextField fullWidth label="Manager email" placeholder="manager@store.com" value={newStore.managerEmail} onChange={(e) => setNewStore({ ...newStore, managerEmail: e.target.value })} error={Boolean(storeErrors.managerEmail)} helperText={storeErrors.managerEmail} />
              <TextField fullWidth label="Login username" placeholder="AP20" helperText={`Defaults to Store ID ${newStore.storeCode || 'AP20'}`} value={newStore.username} onChange={(e) => setNewStore({ ...newStore, username: e.target.value })} />
              <TextField
                fullWidth
                type="password"
                label="Password"
                error={Boolean(storeErrors.password)}
                helperText={storeErrors.password || 'Leave as store123, or type your own'}
                value={newStore.password}
                autoComplete="new-password"
                slotProps={{ htmlInput: { autoComplete: 'new-password' } }}
                onChange={(e) => setNewStore({ ...newStore, password: e.target.value })}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenAddModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ fontWeight: 800 }}>Create store</Button>
          </DialogActions>
        </form>
      </Dialog>

      <StoreDetailsModal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        storeId={selectedStoreId}
        onStoreUpdated={fetchStores}
      />

      <ConfirmDialog
        open={Boolean(deleteStore)}
        title="Delete mini store?"
        message={`This removes ${deleteStore?.storeName || 'this store'} (${deleteStore?.storeCode || ''}), its login, and staff records. This cannot be undone.`}
        confirmLabel="Delete store"
        loading={deleting}
        onCancel={() => !deleting && setDeleteStore(null)}
        onConfirm={handleDeleteStore}
      />
    </Box>
  );
};

export default MiniStoresPage;
