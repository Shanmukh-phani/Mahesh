import React, { useContext, useState, useEffect } from 'react';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography,
  AppBar, Toolbar, IconButton, Avatar, Badge, Popover, Divider, Menu, MenuItem, Tooltip, Button
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShieldCheck, Store as StoreIcon, MessageSquareWarning, Bell,
  LogOut, Menu as MenuIcon, KeyRound, ArrowRight, BellOff, Info, History, Wallet
} from 'lucide-react';
import { useActivityTracker } from '../services/activity';
import { formatDistanceToNow } from 'date-fns';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import socket, { roomForUser, setSocketRoom } from '../services/socket';
import toast from 'react-hot-toast';
import { executiveTheme } from '../theme/theme';
import { notificationTarget, announceNotificationsRead, applyReadEvent, NOTIFICATIONS_READ_EVENT } from '../utils/notificationLinks';
import NotificationContext from './NotificationContext';
import ChangePasswordDialog from './ChangePasswordDialog';

const drawerWidth = 270;
const PURPLE = '#7C3AED';
const PURPLE_DARK = '#6D28D9';

const timeAgo = (date) => {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '';
  }
};

const notifTone = (type) => {
  if (type === 'APPROVAL_REQUIRED') return { icon: <ShieldCheck size={16} />, bg: '#EDE9FE', color: PURPLE_DARK };
  if (type === 'NEW_COMPLAINT') return { icon: <MessageSquareWarning size={16} />, bg: '#FFE4E6', color: '#BE123C' };
  if (type === 'EXPENSE_RECEIPT') return { icon: <Wallet size={16} />, bg: '#DBEAFE', color: '#1D4ED8' };
  return { icon: <Info size={16} />, bg: '#F1F5F9', color: '#475569' };
};

const ExecutiveLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  useActivityTracker();

  const [notifications, setNotifications] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const [userAnchorEl, setUserAnchorEl] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  };

  const fetchPending = async () => {
    try {
      const res = await api.get('/requests?stage=pending');
      setPendingCount((res.data || []).length);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchPending();
    setSocketRoom(roomForUser(user));

    const handleNewNotif = (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
      toast.custom((t) => (
        <Box
          onClick={() => { toast.dismiss(t.id); navigate(notificationTarget(newNotif, 'EXECUTIVE')); }}
          sx={{
            bgcolor: '#FFFFFF', color: '#0F172A', border: '1px solid #E2E8F0', borderLeft: `4px solid ${PURPLE}`,
            p: 2, borderRadius: 3, boxShadow: '0 10px 25px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center',
            gap: 1.5, cursor: 'pointer', width: 380, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box'
          }}
        >
          <Bell size={20} color={PURPLE} style={{ flexShrink: 0 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ overflowWrap: 'anywhere' }}>{newNotif.title}</Typography>
            <NotificationContext notif={newNotif} showProduct sx={{ mb: 0.5 }} />
            <Typography variant="caption" sx={{ color: '#64748B', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{newNotif.message}</Typography>
          </Box>
        </Box>
      ));
    };

    socket.on('new_notification', handleNewNotif);
    socket.on('medicine_request_created', fetchPending);
    socket.on('medicine_request_updated', fetchPending);
    window.addEventListener('medconnect:executive-reviewed', fetchPending);

    return () => {
      socket.off('new_notification', handleNewNotif);
      socket.off('medicine_request_created', fetchPending);
      socket.off('medicine_request_updated', fetchPending);
      window.removeEventListener('medconnect:executive-reviewed', fetchPending);
    };
  }, [user]);

  useEffect(() => {
    const handleRead = (e) => setNotifications((prev) => applyReadEvent(prev, e.detail));
    window.addEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenNotif = async (notif) => {
    setNotifAnchorEl(null);
    navigate(notificationTarget(notif, 'EXECUTIVE'));
    if (!notif.isRead && notif._id) {
      setNotifications((prev) => prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n)));
      announceNotificationsRead(notif._id);
      try {
        await api.put(`/notifications/${notif._id}/read`);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      announceNotificationsRead();
    } catch (err) {
      console.error(err);
    }
  };

  const menuItems = [
    { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/executive' },
    { text: 'Approvals', icon: <ShieldCheck size={20} />, path: '/executive/approvals', badge: pendingCount },
    { text: 'My Stores & Staff', icon: <StoreIcon size={20} />, path: '/executive/stores' },
    { text: 'Complaints', icon: <MessageSquareWarning size={20} />, path: '/executive/complaints' },
    { text: 'Store Expenses', icon: <Wallet size={20} />, path: '/executive/expenses' },
    { text: 'Activity Logs', icon: <History size={20} />, path: '/executive/activity' },
    { text: 'Notifications', icon: <Bell size={20} />, path: '/executive/notifications', badge: unreadCount }
  ];
  const activeItem = menuItems.find((item) => item.path === location.pathname);
  const initial = user?.name?.charAt(0)?.toUpperCase() || 'E';
  const storeCount = user?.assignedStores?.length || 0;

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#FFFFFF', borderRight: '1px solid #E2E8F0' }}>
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #F1F5F9' }}>
        <Box sx={{ bgcolor: PURPLE, p: 1.1, borderRadius: '12px', color: 'white', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <ShieldCheck size={22} />
        </Box>
        <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
          <Typography fontWeight="800" sx={{ color: '#0F172A', lineHeight: 1.15, fontSize: '1rem' }} noWrap>Executive Portal</Typography>
          <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: '0.74rem', mt: 0.3 }} noWrap>
            {storeCount} assigned store{storeCount === 1 ? '' : 's'}
          </Typography>
        </Box>
      </Box>

      <List sx={{ flex: 1, px: 1.5, py: 1.5, overflowY: 'auto' }}>
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.text}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              sx={{
                borderRadius: '10px', mb: 0.5, py: 1.1, px: 1.75,
                bgcolor: active ? '#F5F3FF' : 'transparent',
                color: active ? PURPLE_DARK : '#475569',
                '&:hover': { bgcolor: active ? '#EDE9FE' : '#F8FAFC', color: active ? PURPLE_DARK : '#0F172A' }
              }}
            >
              <ListItemIcon sx={{ color: active ? PURPLE : '#94A3B8', minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} slotProps={{ primary: { sx: { fontWeight: active ? 800 : 600, fontSize: '0.9rem' } } }} />
              {item.badge > 0 && (
                <Box sx={{ bgcolor: item.path === '/executive/approvals' ? '#F59E0B' : PURPLE, color: 'white', borderRadius: '99px', px: 1, py: 0.2, fontSize: '0.72rem', fontWeight: 800 }}>
                  {item.badge}
                </Box>
              )}
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ p: 2, borderTop: '1px solid #F1F5F9' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 1 }}>
          <Avatar sx={{ bgcolor: PURPLE, width: 36, height: 36, fontWeight: 800, fontSize: '0.9rem' }}>{initial}</Avatar>
          <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight="800" color="#0F172A" noWrap>{user?.name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>Executive Officer</Typography>
          </Box>
        </Box>
        <ListItemButton onClick={logout} sx={{ borderRadius: '10px', color: '#DC2626', bgcolor: '#FEF2F2', '&:hover': { bgcolor: '#FEE2E2' } }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><LogOut size={18} /></ListItemIcon>
          <ListItemText primary="Sign Out" slotProps={{ primary: { sx: { fontWeight: 800, fontSize: '0.85rem' } } }} />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={executiveTheme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F8FAFC' }}>
        <AppBar
          position="fixed"
          sx={{
            width: { sm: `calc(100% - ${drawerWidth}px)` }, ml: { sm: `${drawerWidth}px` },
            bgcolor: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(12px)', color: '#0F172A',
            boxShadow: 'none', borderBottom: '1px solid #E2E8F0', zIndex: (theme) => theme.zIndex.drawer + 1
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ display: { sm: 'none' }, bgcolor: '#F5F3FF', color: PURPLE_DARK, '&:hover': { bgcolor: '#EDE9FE' } }}>
                <MenuIcon size={20} />
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: '#94A3B8', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.6px', textTransform: 'uppercase', lineHeight: 1.2 }} noWrap>
                  {user?.name || 'Executive Officer'}
                </Typography>
                <Typography fontWeight="800" sx={{ color: '#0F172A', fontSize: { xs: '0.98rem', sm: '1.1rem' }, lineHeight: 1.25 }} noWrap>
                  {activeItem?.text || 'Executive Portal'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, flexShrink: 0 }}>
              {pendingCount > 0 && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ShieldCheck size={16} />}
                  onClick={() => navigate('/executive/approvals')}
                  sx={{ display: { xs: 'none', md: 'inline-flex' }, borderRadius: '10px', fontWeight: 800, px: 2 }}
                >
                  {pendingCount} to approve
                </Button>
              )}
              <Tooltip title="Notifications">
                <IconButton onClick={(e) => setNotifAnchorEl(e.currentTarget)} sx={{ bgcolor: '#F5F3FF', color: PURPLE_DARK, '&:hover': { bgcolor: '#EDE9FE' }, p: 1.1 }}>
                  <Badge badgeContent={unreadCount} color="error" max={99}><Bell size={20} /></Badge>
                </IconButton>
              </Tooltip>

              <Popover
                open={Boolean(notifAnchorEl)}
                anchorEl={notifAnchorEl}
                onClose={() => setNotifAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 24px)', mt: 1.25, borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0' } } }}
              >
                <Box sx={{ px: 2.25, pt: 2, pb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Notifications</Typography>
                  {unreadCount > 0 && (
                    <Button size="small" onClick={handleMarkAllRead} sx={{ color: PURPLE, fontWeight: 800, fontSize: '0.76rem' }}>Mark all read</Button>
                  )}
                </Box>
                <Divider />
                <Box sx={{ maxHeight: { xs: '55vh', sm: 380 }, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <Box sx={{ py: 5, px: 3, textAlign: 'center' }}>
                      <BellOff size={22} color={PURPLE} />
                      <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem', mt: 1 }}>No notifications yet</Typography>
                      <Typography sx={{ color: '#64748B', fontSize: '0.8rem', mt: 0.4 }}>New requests from your stores will show here.</Typography>
                    </Box>
                  ) : notifications.slice(0, 8).map((notif) => {
                    const tone = notifTone(notif.type);
                    return (
                      <Box
                        key={notif._id}
                        onClick={() => handleOpenNotif(notif)}
                        sx={{ display: 'flex', gap: 1.25, px: 2.25, py: 1.4, cursor: 'pointer', bgcolor: notif.isRead ? '#FFFFFF' : '#FAF5FF', borderBottom: '1px solid #F1F5F9', '&:hover': { bgcolor: '#F8FAFC' } }}
                      >
                        <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: tone.bg, color: tone.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{tone.icon}</Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontWeight: notif.isRead ? 700 : 800, color: '#0F172A', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>{notif.title}</Typography>
                          <NotificationContext notif={notif} sx={{ mt: 0.4 }} />
                          <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mt: 0.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{notif.message}</Typography>
                          <Typography sx={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 700, mt: 0.4 }}>{timeAgo(notif.createdAt)}</Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
                <Divider />
                <Box sx={{ p: 1.25 }}>
                  <Button fullWidth endIcon={<ArrowRight size={16} />} onClick={() => { setNotifAnchorEl(null); navigate('/executive/notifications'); }} sx={{ color: PURPLE_DARK, fontWeight: 800, borderRadius: '10px' }}>
                    View all notifications
                  </Button>
                </Box>
              </Popover>

              <IconButton onClick={(e) => setUserAnchorEl(e.currentTarget)} sx={{ p: 0.4, border: '2px solid #DDD6FE' }}>
                <Avatar sx={{ bgcolor: PURPLE, width: 34, height: 34, fontWeight: 800, fontSize: '0.9rem' }}>{initial}</Avatar>
              </IconButton>
              <Menu anchorEl={userAnchorEl} open={Boolean(userAnchorEl)} onClose={() => setUserAnchorEl(null)} slotProps={{ paper: { sx: { borderRadius: 3, minWidth: 210, mt: 1 } } }}>
                <MenuItem disabled sx={{ opacity: '1 !important' }}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="800">{user?.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>EXECUTIVE OFFICER</Typography>
                    {user?.username && <Typography variant="caption" color="text.secondary">Login: {user.username}</Typography>}
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => { setUserAnchorEl(null); setPasswordOpen(true); }} sx={{ fontWeight: 700 }}>
                  <KeyRound size={16} style={{ marginRight: 8 }} /> Change password
                </MenuItem>
                <MenuItem onClick={logout} sx={{ color: 'error.main', fontWeight: 700 }}>
                  <LogOut size={16} style={{ marginRight: 8 }} /> Logout
                </MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, border: 'none' } }}
          >
            {drawerContent}
          </Drawer>
          <Drawer
            variant="permanent"
            open
            sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, border: 'none' } }}
          >
            {drawerContent}
          </Drawer>
        </Box>

        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, sm: 3, md: 4 }, width: { xs: '100%', sm: `calc(100% - ${drawerWidth}px)` }, minWidth: 0, minHeight: '100vh' }}>
          <Toolbar />
          <Outlet />
          <Box sx={{ height: 40 }} />
        </Box>
        <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      </Box>
    </ThemeProvider>
  );
};

export default ExecutiveLayout;
