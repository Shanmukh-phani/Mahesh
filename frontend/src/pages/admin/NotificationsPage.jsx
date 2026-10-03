import React, { useEffect, useState, useContext } from 'react';
import {
  Box, Typography, Card, Button, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import { Bell, CheckCheck, Send, AlertTriangle, Info, Clock, Volume2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  notificationTarget, notificationActionLabel, announceNotificationsRead, applyReadEvent, NOTIFICATIONS_READ_EVENT
} from '../../utils/notificationLinks';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
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
  const [openBroadcastModal, setOpenBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', targetStoreId: '' });
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
    try {
      await api.post('/notifications/broadcast', broadcastForm);
      toast.success('Broadcast notification published to mini stores');
      setOpenBroadcastModal(false);
      setBroadcastForm({ title: '', message: '', targetStoreId: '' });
      fetchNotifications();
    } catch (err) {
      toast.error('Failed to send broadcast notification');
    }
  };

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === 'UNREAD') return !notif.isRead;
    if (filter === 'BROADCAST') return notif.type === 'BROADCAST';
    if (filter === 'REQUESTS') return notif.type === 'NEW_REQUEST' || notif.type === 'STATUS_UPDATE';
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
    if (type === 'LOW_STOCK') return { icon: <AlertTriangle size={18} />, bg: '#FEE2E2', color: '#991B1B' };
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

      <Card className="white-card" sx={{ p: 1, mb: 2.5, borderRadius: '16px', display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
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
                      <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>{notif.title}</Typography>
                      {!notif.isRead && <Chip label="NEW" size="small" color="error" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 800 }} />}
                    </Box>
                    <Typography sx={{ color: '#334155', fontSize: '0.88rem', lineHeight: 1.55 }}>{notif.message}</Typography>
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
                  options={[{ value: '', label: 'All stores' }, ...stores.map((st) => ({ value: st._id, label: st.storeCode }))]}
                  value={broadcastForm.targetStoreId}
                  onChange={(targetStoreId) => setBroadcastForm({ ...broadcastForm, targetStoreId })}
                />
              </Box>
              <TextField fullWidth required multiline minRows={2} label="Message" placeholder="Short note for branch managers..." value={broadcastForm.message} onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenBroadcastModal(false)} sx={{ fontWeight: 700, color: '#64748B' }}>Cancel</Button>
            <Button type="submit" variant="contained" startIcon={<Send size={16} />} sx={{ fontWeight: 800 }}>Publish</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default NotificationsPage;
