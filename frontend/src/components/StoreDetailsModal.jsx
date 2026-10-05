import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Card,
  Chip, Button, TextField, IconButton, Tabs, Tab, Switch, CircularProgress,
  MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import { Store, User, Plus, Edit2, Trash2, Users, X } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ChoiceChips, dialogPaperSx } from './admin/AdminChrome';
import ConfirmDialog from './ConfirmDialog';
import { limitPhone, phoneError, emailError, requiredText, firstError, phoneFieldProps } from '../utils/validation';

const isBlank = (value) => {
  const v = String(value ?? '').trim();
  return !v || v === '—' || v === '-' || /^n\/?a$/i.test(v);
};

const isEmail = (value) => /\S+@\S+\.\S+/.test(String(value || '').trim());
const isPhone = (value) => String(value || '').replace(/\D/g, '').length >= 8;

const InfoItem = ({ label, value, color = '#0F172A', kind }) => {
  if (isBlank(value)) return null;
  if (kind === 'email' && !isEmail(value)) return null;
  if (kind === 'phone' && !isPhone(value)) return null;
  return (
    <Box sx={{ minWidth: 0, py: 1.1, borderBottom: '1px solid #F1F5F9' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.68rem', color: '#64748B', letterSpacing: '0.5px', mb: 0.35 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, color, fontSize: '0.9rem', lineHeight: 1.4, wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  );
};

const StoreDetailsModal = ({ open, onClose, storeId, onStoreUpdated }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');

  const [deleteEmp, setDeleteEmp] = useState(null);
  const [deletingEmp, setDeletingEmp] = useState(false);
  const [triedEmp, setTriedEmp] = useState(false);
  const [openEmpModal, setOpenEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empForm, setEmpForm] = useState({
    employeeName: '',
    employeeId: '',
    designation: 'Employee',
    phone: '',
    email: '',
    address: '',
    status: 'Active',
    username: '',
    password: ''
  });

  const fetchStoreDetails = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await api.get(`/stores/${storeId}`);
      const list = res.data.employees || [];
      setStoreData(res.data);
      setEmployees(list);
      setSelectedEmpId((prev) => (prev && list.some((e) => e._id === prev) ? prev : (list[0]?._id || '')));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load store details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && storeId) {
      setActiveTab(0);
      setSelectedEmpId('');
      fetchStoreDetails();
    }
  }, [open, storeId]);

  const handleOpenAddEmp = () => {
    setEditingEmp(null);
    const code = storeData?.store?.storeCode || 'AP20';
    const seq = String(((storeData?.employees || []).length || 0) + 1).padStart(2, '0');
    setEmpForm({
      employeeName: '',
      employeeId: `EMP-${code}-${seq}`,
      designation: 'Employee',
      phone: '',
      email: '',
      address: '',
      status: 'Active',
      username: '',
      password: ''
    });
    setTriedEmp(false);
    setOpenEmpModal(true);
  };

  const handleOpenEditEmp = (emp) => {
    setEditingEmp(emp);
    setEmpForm({
      employeeName: emp.employeeName || '',
      employeeId: emp.employeeId || '',
      designation: emp.designation || 'Employee',
      phone: emp.phone || '',
      email: emp.email || '',
      address: emp.address || '',
      status: emp.status || (emp.isActive ? 'Active' : 'Inactive'),
      username: emp.login?.username || '',
      password: ''
    });
    setTriedEmp(false);
    setOpenEmpModal(true);
  };

  const hasLogin = Boolean(editingEmp?.login);
  const loginError = () => {
    const u = empForm.username.trim();
    const p = empForm.password;
    if (!u && !p) return '';
    if (!u) return 'Login username is required';
    if (!/^[a-zA-Z0-9._-]{3,60}$/.test(u)) return 'Username: 3+ letters, numbers, dot, dash or underscore';
    if (!hasLogin && !p) return 'Set a password for the new login';
    if (p && p.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const empErrors = {
    employeeName: requiredText(empForm.employeeName, 'Employee name'),
    phone: phoneError(empForm.phone),
    email: emailError(empForm.email),
    login: loginError()
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    setTriedEmp(true);
    const err = firstError(...Object.values(empErrors));
    if (err) {
      toast.error(err);
      return;
    }

    try {
      if (editingEmp) {
        await api.put(`/employees/${editingEmp._id}`, empForm);
        toast.success('Employee updated successfully');
      } else {
        await api.post(`/employees/store/${storeId}`, empForm);
        toast.success('Employee added successfully');
      }
      setOpenEmpModal(false);
      fetchStoreDetails();
      if (onStoreUpdated) onStoreUpdated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save employee');
    }
  };

  const handleToggleEmpStatus = async (emp) => {
    const newStatus = emp.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.put(`/employees/${emp._id}/status`, { status: newStatus });
      toast.success(`Employee ${emp.employeeName} status set to ${newStatus}`);
      fetchStoreDetails();
      if (onStoreUpdated) onStoreUpdated();
    } catch (err) {
      toast.error('Failed to change employee status');
    }
  };

  const handleDeleteEmp = async () => {
    if (!deleteEmp) return;
    setDeletingEmp(true);
    try {
      await api.delete(`/employees/${deleteEmp._id}`);
      toast.success('Employee deleted successfully');
      setDeleteEmp(null);
      fetchStoreDetails();
      if (onStoreUpdated) onStoreUpdated();
    } catch (err) {
      toast.error('Failed to delete employee');
    } finally {
      setDeletingEmp(false);
    }
  };

  const store = storeData?.store;
  const isActive = store && (store.status === 'Active' || store.isActive !== false);
  const loginId = storeData?.loginId || store?.storeCode || 'AP20';
  const selectedEmp = employees.find((e) => e._id === selectedEmpId) || null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        fullScreen={false}
        PaperProps={{
          sx: {
            borderRadius: { xs: '16px', sm: '20px' },
            bgcolor: '#FFFFFF',
            maxHeight: { xs: '92vh', sm: '90vh' },
            m: { xs: 1, sm: 2 },
            width: { xs: 'calc(100% - 16px)', sm: '100%' }
          }
        }}
      >
        {loading || !store ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <CircularProgress color="primary" />
            <Typography variant="body2" color="text.secondary" mt={2}>Loading store details...</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2.25, pb: 0, borderBottom: '1px solid #E2E8F0' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
                  <Box sx={{ width: 46, height: 46, borderRadius: '14px', bgcolor: '#CCFBF1', color: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Store size={22} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: '1.1rem', sm: '1.3rem' }, letterSpacing: '-0.03em', lineHeight: 1.25 }}>
                      {store.storeName}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.7, mt: 0.8 }}>
                      <Chip label={store.storeCode} size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }} />
                      <Chip
                        label={isActive ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{ bgcolor: isActive ? '#DCFCE7' : '#FEE2E2', color: isActive ? '#166534' : '#991B1B', fontWeight: 800 }}
                      />
                    </Box>
                  </Box>
                </Box>
                <IconButton onClick={onClose} sx={{ bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', flexShrink: 0 }}><X size={18} /></IconButton>
              </Box>

              <Tabs
                value={activeTab}
                onChange={(e, val) => setActiveTab(val)}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                  minHeight: 42,
                  '& .MuiTab-root': { minHeight: 42, fontWeight: 800, fontSize: '0.82rem', textTransform: 'none', px: { xs: 1.5, sm: 2 } },
                  '& .Mui-selected': { color: '#0F766E' },
                  '& .MuiTabs-indicator': { bgcolor: '#0D9488', height: 3, borderRadius: 2 }
                }}
              >
                <Tab icon={<Store size={15} />} iconPosition="start" label="Overview" />
                <Tab icon={<Users size={15} />} iconPosition="start" label={`Staff (${employees.length})`} />
              </Tabs>
            </Box>

            <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
              {activeTab === 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  <Card className="white-card" sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: '16px' }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Store size={16} color="#0D9488" /> Store
                    </Typography>
                    <InfoItem label="STORE NAME" value={store.storeName} />
                    <InfoItem label="STORE ID" value={store.storeCode} color="#0D9488" />
                    <InfoItem label="MANAGER LOGIN" value={loginId} color="#2563EB" />
                    <InfoItem label="EXECUTIVE OFFICER" value={store.executiveId ? (store.executiveId.name || store.executiveId.username) : 'Not assigned (requests go straight to main branch)'} color="#7C3AED" />
                    <InfoItem label="ADDRESS" value={store.location} />
                    <InfoItem label="STORE PHONE" value={store.phone} kind="phone" />
                    <InfoItem label="STORE EMAIL" value={store.email} kind="email" />
                  </Card>

                  <Card className="white-card" sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: '16px' }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <User size={16} color="#0D9488" /> Manager
                    </Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.75rem', mb: 0.5 }}>Looks after multiple stores</Typography>
                    <InfoItem label="MANAGER NAME" value={store.contactPerson} />
                    <InfoItem label="MANAGER PHONE" value={store.managerPhone} kind="phone" />
                    <InfoItem label="MANAGER EMAIL" value={store.managerEmail} kind="email" />
                    <InfoItem label="STATUS" value={isActive ? 'Active' : 'Inactive'} color={isActive ? '#166534' : '#991B1B'} />
                    <InfoItem label="TOTAL STAFF" value={`${employees.length} members`} color="#0D9488" />
                  </Card>
                </Box>
              )}

              {activeTab === 1 && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.25, flexWrap: 'wrap', mb: 2 }}>
                    <FormControl fullWidth sx={{ minWidth: { xs: '100%', sm: 260 }, flex: 1 }}>
                      <InputLabel>Employee</InputLabel>
                      <Select
                        label="Employee"
                        value={selectedEmpId}
                        onChange={(e) => setSelectedEmpId(e.target.value)}
                        displayEmpty
                      >
                        {employees.length === 0 && <MenuItem value="" disabled>No employees yet</MenuItem>}
                        {employees.map((emp) => (
                          <MenuItem key={emp._id} value={emp._id}>
                            {emp.employeeName}{emp.designation ? ` · ${emp.designation}` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={handleOpenAddEmp} sx={{ fontWeight: 800, width: { xs: '100%', sm: 'auto' }, whiteSpace: 'nowrap' }}>
                      Add employee
                    </Button>
                  </Box>

                  {!selectedEmp ? (
                    <Box sx={{ py: 5, textAlign: 'center', color: '#64748B' }}>No staff yet. Add an employee to this store.</Box>
                  ) : (
                    <Card className="white-card" sx={{ p: { xs: 1.75, sm: 2.25 }, borderRadius: '16px' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>{selectedEmp.employeeName}</Typography>
                        <Switch size="small" checked={selectedEmp.status === 'Active'} onChange={() => handleToggleEmpStatus(selectedEmp)} color="primary" />
                      </Box>
                      <InfoItem label="EMPLOYEE ID" value={selectedEmp.employeeId} color="#0D9488" />
                      <InfoItem
                        label="LOGIN"
                        value={selectedEmp.login ? `${selectedEmp.login.username}${selectedEmp.login.isActive === false ? ' (disabled)' : ''}` : 'No login yet. Edit to create one.'}
                        color={selectedEmp.login ? '#2563EB' : '#94A3B8'}
                      />
                      <InfoItem label="ROLE" value={selectedEmp.designation} />
                      <InfoItem label="PHONE" value={selectedEmp.phone} kind="phone" />
                      <InfoItem label="EMAIL" value={selectedEmp.email} kind="email" />
                      <InfoItem label="ADDRESS" value={selectedEmp.address} />
                      <InfoItem label="STATUS" value={selectedEmp.status === 'Active' ? 'Active' : 'Inactive'} color={selectedEmp.status === 'Active' ? '#166534' : '#991B1B'} />
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                        <Button size="small" variant="outlined" startIcon={<Edit2 size={14} />} onClick={() => handleOpenEditEmp(selectedEmp)} sx={{ fontWeight: 800 }}>Edit</Button>
                        <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={() => setDeleteEmp(selectedEmp)} sx={{ fontWeight: 800 }}>Delete</Button>
                      </Box>
                    </Card>
                  )}
                </Box>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

      <Dialog open={openEmpModal} onClose={() => setOpenEmpModal(false)} maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleSaveEmployee}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
            {editingEmp ? 'Edit employee' : 'Add employee'}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                fullWidth
                required
                autoFocus
                label="Full name"
                placeholder="Enter full name"
                value={empForm.employeeName}
                onChange={(e) => setEmpForm({ ...empForm, employeeName: e.target.value })}
                error={triedEmp && Boolean(empErrors.employeeName)}
                helperText={triedEmp ? empErrors.employeeName : ''}
              />
              <TextField
                fullWidth
                required
                label="Employee ID"
                placeholder="EMP-AP20-01"
                value={empForm.employeeId}
                onChange={(e) => setEmpForm({ ...empForm, employeeId: e.target.value })}
              />
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>ROLE</Typography>
                <ChoiceChips
                  options={['Employee', 'Other'].includes(empForm.designation) ? ['Employee', 'Other'] : [empForm.designation, 'Employee', 'Other']}
                  value={empForm.designation}
                  onChange={(designation) => setEmpForm({ ...empForm, designation })}
                />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>STATUS</Typography>
                <ChoiceChips
                  options={['Active', 'Inactive']}
                  value={empForm.status}
                  onChange={(status) => setEmpForm({ ...empForm, status })}
                />
              </Box>
              <TextField fullWidth label="Phone" placeholder="9876543210" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: limitPhone(e.target.value) })} error={Boolean(empErrors.phone)} helperText={empErrors.phone || '10-digit mobile'} slotProps={{ htmlInput: phoneFieldProps }} />
              <TextField fullWidth label="Email" placeholder="employee@store.com" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} error={Boolean(empErrors.email)} helperText={empErrors.email} />
              <TextField fullWidth label="Address" placeholder="Area / landmark" value={empForm.address} onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })} />
              <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B' }}>
                  PERSONAL LOGIN {hasLogin ? '' : '(optional)'}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="Login username"
                  placeholder="e.g. ravi.ap20"
                  value={empForm.username}
                  onChange={(e) => setEmpForm({ ...empForm, username: e.target.value.replace(/\s/g, '') })}
                />
                <TextField
                  fullWidth
                  size="small"
                  label={hasLogin ? 'New password (optional)' : 'Password'}
                  value={empForm.password}
                  onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })}
                  error={triedEmp && Boolean(empErrors.login)}
                  helperText={(triedEmp && empErrors.login) || (hasLogin ? 'Leave empty to keep the current password' : 'Each employee logs in with their own account')}
                />
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenEmpModal(false)} sx={{ color: 'text.secondary', fontWeight: 700 }}>Cancel</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 800 }}>
              {editingEmp ? 'Update' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteEmp)}
        title="Delete employee?"
        message={`This removes ${deleteEmp?.employeeName || 'this employee'} from the store staff list. This cannot be undone.`}
        confirmLabel="Delete employee"
        loading={deletingEmp}
        onCancel={() => !deletingEmp && setDeleteEmp(null)}
        onConfirm={handleDeleteEmp}
      />
    </>
  );
};

export default StoreDetailsModal;
