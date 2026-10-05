import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Box, Card, Typography, Button, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, Tooltip, Switch, Alert
} from '@mui/material';
import {
  ShieldCheck, UserCog, Plus, Pencil, Trash2, Store as StoreIcon, Crown, KeyRound, RefreshCw, Check, AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { AuthContext } from '../../context/AuthContext';
import { PageHeader, StatCard, EmptyState, dialogPaperSx } from '../../components/admin/AdminChrome';
import ConfirmDialog from '../../components/ConfirmDialog';

const emptyForm = { name: '', username: '', password: '', phone: '', email: '', storeIds: [] };

const lastSeen = (u) => (u.lastLoginAt ? `Last login ${formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true })}` : 'Never logged in');

const TeamPage = () => {
  const { user } = useContext(AuthContext);
  const isMain = user?.role === 'ADMIN' && user?.adminLevel !== 'SUB';
  const [tab, setTab] = useState('EXECUTIVE');
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // { role, user? }
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [uRes, sRes] = await Promise.all([api.get('/users'), api.get('/stores')]);
      setUsers(uRes.data || []);
      setStores(sRes.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const admins = users.filter((u) => u.role === 'ADMIN');
  const executives = users.filter((u) => u.role === 'EXECUTIVE');
  const unassignedStores = stores.filter((s) => !s.executiveId);
  const execNameById = useMemo(() => Object.fromEntries(executives.map((e) => [e._id, e.name || e.username])), [executives]);

  const canManage = (u) => (u.role === 'EXECUTIVE' ? true : isMain && u.adminLevel === 'SUB');

  const openCreate = (role) => {
    setForm(emptyForm);
    setDialog({ role });
  };

  const openEdit = (u) => {
    setForm({
      name: u.name || '',
      username: u.username || '',
      password: '',
      phone: u.phone || '',
      email: u.email || '',
      storeIds: (u.assignedStores || []).map((s) => s._id)
    });
    setDialog({ role: u.role, user: u });
  };

  const toggleStore = (id) => setForm((prev) => ({
    ...prev,
    storeIds: prev.storeIds.includes(id) ? prev.storeIds.filter((s) => s !== id) : [...prev.storeIds, id]
  }));

  const handleSave = async (e) => {
    e.preventDefault();
    const editing = dialog?.user;
    if (!form.name.trim() || !form.username.trim()) {
      toast.error('Name and username are required');
      return;
    }
    if (!editing && form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        username: form.username.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        ...(form.password ? { password: form.password } : {}),
        ...(dialog.role === 'EXECUTIVE' ? { storeIds: form.storeIds } : {})
      };
      if (editing) {
        await api.put(`/users/${editing._id}`, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await api.post('/users', { ...payload, role: dialog.role });
        toast.success(`${dialog.role === 'ADMIN' ? 'Admin' : 'Executive officer'} ${payload.name} created`);
      }
      setDialog(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await api.put(`/users/${u._id}`, { isActive: !u.isActive });
      toast.success(`${u.name || u.username} ${u.isActive ? 'deactivated' : 'activated'}`);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update');
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/users/${toDelete._id}`);
      toast.success(`${toDelete.name || toDelete.username} removed`);
      setToDelete(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete');
    } finally {
      setDeleting(false);
    }
  };

  const renderUserCard = (u) => {
    const main = u.role === 'ADMIN' && u.adminLevel !== 'SUB';
    const manageable = canManage(u) && String(u._id) !== String(user?._id);
    return (
      <Box key={u._id} sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: u.isActive === false ? '#F8FAFC' : '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 1.1, minWidth: 0, opacity: u.isActive === false ? 0.75 : 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#FFFFFF', bgcolor: main ? '#B45309' : u.role === 'ADMIN' ? '#0D9488' : '#7C3AED' }}>
              {main ? <Crown size={18} /> : (u.name || u.username || '?').charAt(0).toUpperCase()}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', overflowWrap: 'anywhere' }}>
                {u.name || u.username}{String(u._id) === String(user?._id) ? ' (you)' : ''}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748B', overflowWrap: 'anywhere' }}>@{u.username}</Typography>
            </Box>
          </Box>
          <Chip
            size="small"
            label={main ? 'Main Admin' : u.role === 'ADMIN' ? 'Admin' : 'Executive'}
            sx={{ fontWeight: 800, flexShrink: 0, bgcolor: main ? '#FEF3C7' : u.role === 'ADMIN' ? '#CCFBF1' : '#EDE9FE', color: main ? '#92400E' : u.role === 'ADMIN' ? '#0F766E' : '#5B21B6' }}
          />
        </Box>

        {(u.phone || u.email) && (
          <Typography sx={{ fontSize: '0.78rem', color: '#475569', overflowWrap: 'anywhere' }}>{[u.phone, u.email].filter(Boolean).join(' · ')}</Typography>
        )}

        {u.role === 'EXECUTIVE' && (
          <Box>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.6 }}>
              Stores · {u.assignedStores?.length || 0}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
              {(u.assignedStores || []).length === 0 && <Typography sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>No stores assigned</Typography>}
              {(u.assignedStores || []).map((s) => (
                <Chip key={s._id} size="small" icon={<StoreIcon size={12} />} label={`${s.storeCode} · ${s.storeName}`} sx={{ fontWeight: 700, bgcolor: '#F5F3FF', color: '#5B21B6', maxWidth: '100%' }} />
              ))}
            </Box>
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 'auto', pt: 0.5 }}>
          <Typography sx={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
            {lastSeen(u)}{u.createdBy?.name ? ` · added by ${u.createdBy.name}` : ''}
          </Typography>
          {manageable && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title={u.isActive === false ? 'Activate login' : 'Deactivate login'}>
                <Switch size="small" checked={u.isActive !== false} onChange={() => handleToggleActive(u)} />
              </Tooltip>
              <Tooltip title="Edit / reset password">
                <IconButton size="small" onClick={() => openEdit(u)} sx={{ border: '1px solid #E2E8F0' }}><Pencil size={15} /></IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => setToDelete(u)} sx={{ border: '1px solid #FECACA', color: '#B91C1C' }}><Trash2 size={15} /></IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const list = tab === 'EXECUTIVE' ? executives : admins;
  const editing = dialog?.user;

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<ShieldCheck size={26} />}
        title="Team & access"
        subtitle="Main branch admins and executive officers. Executives give the first approval on their stores' requests."
        actions={(
          <>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchAll} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>Refresh</Button>
            {isMain && (
              <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => openCreate('ADMIN')} sx={{ borderRadius: '12px', fontWeight: 800 }}>Add admin</Button>
            )}
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => openCreate('EXECUTIVE')} sx={{ borderRadius: '12px', fontWeight: 800 }}>Add executive</Button>
          </>
        )}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.25, sm: 2 }, mb: 2.5 }}>
        <StatCard title="Admins" value={admins.length} icon={<ShieldCheck size={18} />} />
        <StatCard title="Executives" value={executives.length} icon={<UserCog size={18} />} accent="#7C3AED" />
        <StatCard title="Stores" value={stores.length} icon={<StoreIcon size={18} />} />
        <StatCard title="Without executive" value={unassignedStores.length} icon={<AlertTriangle size={18} />} accent="#D97706" />
      </Box>

      {unassignedStores.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: '12px', '& .MuiAlert-message': { overflowWrap: 'anywhere' } }}>
          {unassignedStores.map((s) => s.storeCode).join(', ')} {unassignedStores.length === 1 ? 'has' : 'have'} no executive officer, so requests from {unassignedStores.length === 1 ? 'it' : 'them'} come straight to the main branch.
        </Alert>
      )}

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: '1px solid #F1F5F9' }}>
          <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#F1F5F9', borderRadius: '12px', width: { xs: '100%', sm: 'fit-content' } }}>
            {[{ value: 'EXECUTIVE', label: 'Executive officers', count: executives.length }, { value: 'ADMIN', label: 'Admins', count: admins.length }].map((t) => (
              <Box
                key={t.value}
                component="button"
                type="button"
                onClick={() => setTab(t.value)}
                sx={{
                  flex: { xs: 1, sm: 'none' }, border: 0, cursor: 'pointer', fontFamily: 'inherit', px: 1.75, py: 0.85, borderRadius: '9px',
                  fontWeight: 800, fontSize: '0.82rem', whiteSpace: 'nowrap',
                  bgcolor: tab === t.value ? '#FFFFFF' : 'transparent', color: tab === t.value ? '#0F766E' : '#64748B',
                  boxShadow: tab === t.value ? '0 1px 3px rgba(15,23,42,0.12)' : 'none'
                }}
              >
                {t.label} ({t.count})
              </Box>
            ))}
          </Box>
          {tab === 'ADMIN' && !isMain && (
            <Typography sx={{ fontSize: '0.78rem', color: '#64748B', mt: 1 }}>Only the main admin can add or change admins.</Typography>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={30} /></Box>
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === 'EXECUTIVE' ? <UserCog size={22} /> : <ShieldCheck size={22} />}
            title={tab === 'EXECUTIVE' ? 'No executive officers yet' : 'No admins'}
            text={tab === 'EXECUTIVE' ? 'Add an executive officer and assign stores. Their stores\' requests will need their approval first.' : ''}
          />
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr' }, gap: 1.5, p: { xs: 1.5, md: 2 } }}>
            {list.map(renderUserCard)}
          </Box>
        )}
      </Card>

      <Dialog
        open={Boolean(dialog)}
        onClose={saving ? undefined : () => setDialog(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { ...dialogPaperSx, m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } }}
      >
        <form onSubmit={handleSave}>
          <DialogTitle sx={{ fontWeight: 800 }}>
            {editing ? `Edit ${editing.name || editing.username}` : dialog?.role === 'ADMIN' ? 'Add admin' : 'Add executive officer'}
          </DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField required size="small" label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <TextField required size="small" label="Login username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '') })} />
              <TextField
                size="small"
                type="text"
                label={editing ? 'New password (optional)' : 'Password'}
                required={!editing}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                helperText={editing ? 'Leave empty to keep the current password' : 'At least 6 characters. Share it with the person.'}
                slotProps={{ input: { startAdornment: <KeyRound size={15} style={{ marginRight: 8, color: '#94A3B8' }} /> } }}
              />
              <TextField size="small" label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <TextField size="small" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} sx={{ gridColumn: '1 / -1' }} />
            </Box>

            {dialog?.role === 'ADMIN' && (
              <Alert severity="info" sx={{ mt: 2, borderRadius: '10px' }}>
                Admins get every main branch screen and action. Their changes are recorded with their name.
              </Alert>
            )}

            {dialog?.role === 'EXECUTIVE' && (
              <Box sx={{ mt: 2.25 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', letterSpacing: '0.5px', textTransform: 'uppercase', mb: 1 }}>
                  Assigned stores · {form.storeIds.length} selected
                </Typography>
                {stores.length === 0 ? (
                  <Typography sx={{ fontSize: '0.82rem', color: '#94A3B8' }}>No stores yet. Create stores first.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, maxHeight: 240, overflowY: 'auto' }}>
                    {stores.map((s) => {
                      const active = form.storeIds.includes(s._id);
                      const ownerId = s.executiveId?._id || s.executiveId;
                      const otherOwner = ownerId && String(ownerId) !== String(editing?._id) ? execNameById[ownerId] || s.executiveId?.name : null;
                      return (
                        <Box
                          key={s._id}
                          component="button"
                          type="button"
                          onClick={() => toggleStore(s._id)}
                          sx={{
                            border: '1px solid', borderColor: active ? '#7C3AED' : '#E2E8F0', bgcolor: active ? '#F5F3FF' : '#FFFFFF',
                            color: active ? '#5B21B6' : '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem',
                            px: 1.1, py: 0.6, borderRadius: '9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5,
                            textAlign: 'left', maxWidth: '100%'
                          }}
                        >
                          {active ? <Check size={13} style={{ flexShrink: 0 }} /> : <StoreIcon size={13} style={{ flexShrink: 0 }} />}
                          <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
                            {s.storeCode} · {s.storeName}
                            {otherOwner && (
                              <Box component="span" sx={{ display: 'block', fontSize: '0.66rem', color: active ? '#B45309' : '#94A3B8', fontWeight: 600 }}>
                                {active ? `moves from ${otherOwner}` : `with ${otherOwner}`}
                              </Box>
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => setDialog(null)} disabled={saving} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null} sx={{ fontWeight: 800, borderRadius: '10px' }}>
              {editing ? 'Save changes' : 'Create login'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove ${toDelete?.name || toDelete?.username || ''}?`}
        message={toDelete?.role === 'EXECUTIVE'
          ? 'Their login is deleted and their stores become unassigned. Requests waiting for their approval are sent straight to the main branch.'
          : 'Their admin login is deleted. Changes they made stay in the history.'}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </Box>
  );
};

export default TeamPage;
