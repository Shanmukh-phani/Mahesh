import React, { useEffect, useState, useContext } from 'react';
import {
  Box, Typography, Card, Button, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputAdornment, Checkbox
} from '@mui/material';
import { Bell, CheckCheck, Send, AlertTriangle, Info, Clock, Volume2, ArrowRight, MessageCircleReply, Search, MessageSquareWarning, ShieldCheck, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  notificationTarget, notificationActionLabel, announceNotificationsRead, applyReadEvent, NOTIFICATIONS_READ_EVENT,
  notificationContext
} from '../../utils/notificationLinks';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import NotificationContext from '../../components/NotificationContext';
import { AuthContext } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PageHeader, EmptyState, dialogPaperSx, ChoiceChips } from '../../components/admin/AdminChrome';

const NotificationsPage = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [openBroadcastModal, setOpenBroadcastModal] = useState(false);
  const emptyBroadcast = { title: '', message: '', sendTo: 'ALL', targetStoreIds: [] };
  const [broadcastForm, setBroadcastForm] = useState(emptyBroadcast);
  const [storeSearch, setStoreSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [stores, setStores] = useState([]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    if (user?.role === 'ADMIN') {
      try {
        const res = await api.get('/stores');
        setStores(res.data);
      } catch (err) {
        console.error(err);
      }
    }
  };

  useAIRefresh(fetchNotifications);

  useEffect(() => {
    fetchNotifications();
    fetchStores();
  }, [user]);

  useEffect(() => {
    const handleRead = (e) => setNotifications((prev) => applyReadEvent(prev, e.detail));
    window.addEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      announceNotificationsRead();
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark read');
    }
  };

  const handleMarkSingleRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      announceNotificationsRead(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenNotification = (notif) => {
    if (!notif.isRead) handleMarkSingleRead(notif._id);
    const target = notificationTarget(notif, user?.role);
    if (notificationActionLabel(notif, user?.role)) navigate(target);
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!broadcastForm.message.trim()) {
      toast.error('Message is required');
      return;
    }
    const chosen = broadcastForm.sendTo === 'CHOOSE';
    if (chosen && !broadcastForm.targetStoreIds.length) {
      toast.error('Select at least one store');
      return;
    }
    setSending(true);
    try {
      await api.post('/notifications/broadcast', {
        title: broadcastForm.title,
        message: broadcastForm.message,
        ...(chosen ? { targetStoreIds: broadcastForm.targetStoreIds } : {})
      });
      const count = broadcastForm.targetStoreIds.length;
      toast.success(chosen ? `Announcement sent to ${count} store${count === 1 ? '' : 's'}` : 'Announcement sent to all stores');
      setOpenBroadcastModal(false);
      setBroadcastForm(emptyBroadcast);
      setStoreSearch('');
      fetchNotifications();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send broadcast notification');
    } finally {
      setSending(false);
    }
  };

  const matchesSearch = (notif) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const ctx = notificationContext(notif);
    return [ctx.requestCode, ctx.storeCode, ctx.storeName, ctx.productName, notif.title, notif.message]
      .some((v) => String(v || '').toLowerCase().includes(term));
  };

  const filteredNotifications = notifications.filter((notif) => {
    if (!matchesSearch(notif)) return false;
    if (filter === 'UNREAD') return !notif.isRead;
    if (filter === 'BROADCAST') return notif.type === 'BROADCAST';
    if (filter === 'REQUESTS') return ['NEW_REQUEST', 'STATUS_UPDATE', 'STORE_RESPONSE', 'NEW_COMPLAINT', 'COMPLAINT_RESPONSE', 'APPROVAL_REQUIRED', 'EXECUTIVE_REVIEW'].includes(notif.type);
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filters = [
    { id: 'ALL', label: `All (${notifications.length})` },
    { id: 'UNREAD', label: `Unread (${unreadCount})` },
    { id: 'REQUESTS', label: 'Request updates' },
    { id: 'BROADCAST', label: 'Announcements' }
  ];

  const typeIcon = (type) => {
    if (type === 'BROADCAST') return { icon: <Volume2 size={18} />, bg: '#E0E7FF', color: '#3730A3' };
    if (type === 'EXPENSE_PAID' || type === 'EXPENSE_RECEIPT') return { icon: <Wallet size={18} />, bg: '#DBEAFE', color: '#1D4ED8' };
    if (type === 'EXPENSE_REMINDER' || type === 'EXPENSE_CHECKED') return { icon: <Wallet size={18} />, bg: type === 'EXPENSE_CHECKED' ? '#DCFCE7' : '#FEF3C7', color: type === 'EXPENSE_CHECKED' ? '#15803D' : '#B45309' };
    if (type === 'LOW_STOCK') return { icon: <AlertTriangle size={18} />, bg: '#FEE2E2', color: '#991B1B' };
    if (type === 'STORE_RESPONSE') return { icon: <MessageCircleReply size={18} />, bg: '#FFEDD5', color: '#C2410C' };
    if (type === 'NEW_COMPLAINT' || type === 'COMPLAINT_RESPONSE') return { icon: <MessageSquareWarning size={18} />, bg: '#FFE4E6', color: '#BE123C' };
    if (type === 'APPROVAL_REQUIRED' || type === 'EXECUTIVE_REVIEW') return { icon: <ShieldCheck size={18} />, bg: '#EDE9FE', color: '#6D28D9' };
    return { icon: <Info size={18} />, bg: '#CCFBF1', color: '#0F766E' };
  };

  return (
    <Box sx={{ maxWidth: '1100px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Bell size={26} />}
        tone="amber"
        title="Notifications"
        subtitle="Request alerts, stock warnings, and branch announcements."
        actions={(
          <>
            <Button variant="outlined" startIcon={<CheckCheck size={16} />} onClick={handleMarkAllRead} sx={{ borderRadius: '12px', fontWeight: 800 }}>
              Mark all read
            </Button>
            {user?.role === 'ADMIN' && (
              <Button variant="contained" startIcon={<Send size={16} />} onClick={() => setOpenBroadcastModal(true)} sx={{ borderRadius: '12px', fontWeight: 800 }}>
                Broadcast
              </Button>
            )}
          </>
        )}
      />

      <Card className="white-card" sx={{ p: 1, mb: 2.5, borderRadius: '16px', display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={user?.role !== 'MINI_STORE' ? 'Search request ID, store code or name...' : 'Search request ID or medicine...'}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} color="#94A3B8" /></InputAdornment> } }}
          sx={{ flex: { xs: '1 1 100%', md: '0 1 320px' }, order: { xs: 0, md: 1 }, ml: { md: 'auto' }, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
        />
        {filters.map((tab) => (
          <Button
            key={tab.id}
            size="small"
            variant={filter === tab.id ? 'contained' : 'text'}
            onClick={() => setFilter(tab.id)}
            sx={{ borderRadius: '10px', fontWeight: 800, px: 1.5 }}
          >
            {tab.label}
          </Button>
        ))}
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={34} /></Box>
      ) : filteredNotifications.length === 0 ? (
        <Card className="white-card" sx={{ borderRadius: '18px' }}>
          <EmptyState icon={<Bell size={22} />} title="You are all caught up" text="No notifications match this filter." />
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {filteredNotifications.map((notif) => {
            const tone = typeIcon(notif.type);
            const actionLabel = notificationActionLabel(notif, user?.role);
            const clickable = Boolean(actionLabel) || !notif.isRead;
            return (
              <Card
                key={notif._id}
                onClick={() => handleOpenNotification(notif)}
                className="white-card"
                sx={{
                  p: { xs: 1.75, md: 2.25 },
                  borderRadius: '16px',
                  bgcolor: notif.isRead ? '#FFFFFF' : 'brand.soft',
                  borderLeft: '4px solid',
                  borderLeftColor: notif.isRead ? '#CBD5E1' : 'primary.main',
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'box-shadow 0.15s ease, transform 0.15s ease',
                  '&:hover': clickable ? { boxShadow: '0 8px 24px -12px rgba(15, 23, 42, 0.25)' } : {}
                }}
              >
                <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
                  <Box sx={{ p: 1.1, borderRadius: '12px', bgcolor: tone.bg, color: tone.color, display: 'flex', flexShrink: 0 }}>
                    {tone.icon}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.4 }}>
                      <Typography sx={{ fontWeight: 800, color: '#0F172A', overflowWrap: 'anywhere', minWidth: 0 }}>{notif.title}</Typography>
                      {!notif.isRead && <Chip label="NEW" size="small" color="error" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 800 }} />}
                    </Box>
                    <NotificationContext
                      notif={notif}
                      variant={user?.role === 'ADMIN' ? 'light' : 'store'}
                      showStore={user?.role !== 'MINI_STORE'}
                      showProduct
                      sx={{ mt: 0.25, mb: 0.9 }}
                    />
                    <Typography sx={{ color: '#334155', fontSize: '0.88rem', lineHeight: 1.55, overflowWrap: 'anywhere' }}>{notif.message}</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600, fontSize: '0.72rem' }}>
                        <Clock size={12} /> {format(new Date(notif.createdAt), 'dd MMM yyyy, p')}
                      </Typography>
                      {actionLabel && (
                        <Button
                          size="small"
                          variant={notif.isRead ? 'outlined' : 'contained'}
                          endIcon={<ArrowRight size={14} />}
                          onClick={(e) => { e.stopPropagation(); handleOpenNotification(notif); }}
                          sx={{ borderRadius: '10px', fontWeight: 800, fontSize: '0.76rem', py: 0.5, px: 1.5 }}
                        >
                          {actionLabel}
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={openBroadcastModal} onClose={() => setOpenBroadcastModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <form onSubmit={handleBroadcastSubmit}>
          <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Send announcement</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>QUICK TITLE</Typography>
                <ChoiceChips
                  options={['Stock arrival', 'Low stock alert', 'Maintenance', 'Urgent notice']}
                  value={broadcastForm.title}
                  onChange={(title) => setBroadcastForm({ ...broadcastForm, title })}
                />
              </Box>
              <TextField fullWidth required label="Title" value={broadcastForm.title} onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })} error={!broadcastForm.title.trim() && Boolean(broadcastForm.message)} helperText={!broadcastForm.title.trim() && broadcastForm.message ? 'Title is required' : ''} />
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>SEND TO</Typography>
                <ChoiceChips
                  options={[{ value: 'ALL', label: `All stores (${stores.length})` }, { value: 'CHOOSE', label: 'Choose stores' }]}
                  value={broadcastForm.sendTo}
                  onChange={(sendTo) => setBroadcastForm({ ...broadcastForm, sendTo })}
                />
                {broadcastForm.sendTo === 'CHOOSE' && (() => {
                  const term = storeSearch.trim().toLowerCase();
                  const visible = stores.filter((st) => !term || `${st.storeCode} ${st.storeName} ${st.location || ''}`.toLowerCase().includes(term));
                  const selected = new Set(broadcastForm.targetStoreIds);
                  const setSelected = (ids) => setBroadcastForm({ ...broadcastForm, targetStoreIds: ids });
                  const toggle = (id) => setSelected(selected.has(id) ? broadcastForm.targetStoreIds.filter((x) => x !== id) : [...broadcastForm.targetStoreIds, id]);
                  const allVisibleSelected = visible.length > 0 && visible.every((st) => selected.has(st._id));
                  return (
                    <Box sx={{ mt: 1.5, border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
                      <Box sx={{ p: 1.25, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #F1F5F9', bgcolor: '#F8FAFC' }}>
                        <TextField
                          size="small"
                          placeholder="Search store ID, name, location..."
                          value={storeSearch}
                          onChange={(e) => setStoreSearch(e.target.value)}
                          sx={{ flex: '1 1 200px', '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#FFFFFF' } }}
                          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} color="#64748B" /></InputAdornment> } }}
                        />
                        <Button
                          size="small"
                          onClick={() => setSelected(allVisibleSelected
                            ? broadcastForm.targetStoreIds.filter((id) => !visible.some((st) => st._id === id))
                            : [...new Set([...broadcastForm.targetStoreIds, ...visible.map((st) => st._id)])])}
                          disabled={!visible.length}
                          sx={{ fontWeight: 800, borderRadius: '10px', whiteSpace: 'nowrap' }}
                        >
                          {allVisibleSelected ? 'Unselect shown' : term ? 'Select shown' : 'Select all'}
                        </Button>
                        {selected.size > 0 && (
                          <Button size="small" onClick={() => setSelected([])} sx={{ fontWeight: 800, borderRadius: '10px', color: '#64748B' }}>Clear</Button>
                        )}
                      </Box>
                      <Box sx={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                        {visible.length === 0 ? (
                          <Typography sx={{ p: 2, color: '#64748B', fontSize: '0.85rem', gridColumn: '1 / -1' }}>No stores match.</Typography>
                        ) : visible.map((st) => (
                          <Box
                            key={st._id}
                            component="label"
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, cursor: 'pointer', borderBottom: '1px solid #F8FAFC', bgcolor: selected.has(st._id) ? '#F0FDFA' : 'transparent', '&:hover': { bgcolor: '#F8FAFC' }, minWidth: 0 }}
                          >
                            <Checkbox size="small" checked={selected.has(st._id)} onChange={() => toggle(st._id)} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#0F172A' }}>
                                {st.storeCode}
                                {st.status === 'Inactive' && <Box component="span" sx={{ ml: 0.75, color: '#B45309', fontSize: '0.68rem' }}>Inactive</Box>}
                              </Typography>
                              <Typography noWrap sx={{ fontSize: '0.74rem', color: '#64748B' }}>{st.storeName}{st.location ? ` · ${st.location}` : ''}</Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                      <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid #F1F5F9', bgcolor: '#F8FAFC' }}>
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: selected.size ? '#0F766E' : '#B45309' }}>
                          {selected.size
                            ? `${selected.size} store${selected.size === 1 ? '' : 's'} selected: ${stores.filter((st) => selected.has(st._id)).map((st) => st.storeCode).join(', ')}`
                            : 'No stores selected yet'}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })()}
              </Box>
              <TextField fullWidth required multiline minRows={2} label="Message" placeholder="Short note for branch managers..." value={broadcastForm.message} onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenBroadcastModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={sending} startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <Send size={16} />} sx={{ fontWeight: 800 }}>
              {broadcastForm.sendTo === 'CHOOSE' ? `Publish to ${broadcastForm.targetStoreIds.length || 0} store${broadcastForm.targetStoreIds.length === 1 ? '' : 's'}` : 'Publish to all stores'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default NotificationsPage;
