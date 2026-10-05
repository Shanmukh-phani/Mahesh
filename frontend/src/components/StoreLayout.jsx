import React, { useContext, useState, useEffect } from 'react';
import { 
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, 
  AppBar, Toolbar, IconButton, Avatar, Badge, Popover, Divider, Menu, MenuItem, Tooltip, Button 
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Search, Package, FileText, PlusCircle, Bell, 
  LogOut, Menu as MenuIcon, Store as StoreIcon, CheckCheck, BellOff, ArrowRight,
  Megaphone, AlertTriangle, XCircle, CheckCircle2, Truck, MessageSquareWarning, ShieldCheck, KeyRound, Wallet
} from 'lucide-react';
import { useActivityTracker } from '../services/activity';
import { EXPENSES_CHANGED_EVENT } from '../utils/expenses';
import ChangePasswordDialog from './ChangePasswordDialog';
import { formatDistanceToNow } from 'date-fns';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import socket, { roomForUser, setSocketRoom } from '../services/socket';
import toast from 'react-hot-toast';
import { storeTheme } from '../theme/theme';
import { notificationTarget, announceNotificationsRead, applyReadEvent, NOTIFICATIONS_READ_EVENT } from '../utils/notificationLinks';
import AskAI from './AskAI';
import NotificationContext from './NotificationContext';

const drawerWidth = 270;

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const timeAgo = (date) => {
  if (!date) return 'Just now';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '';
  }
};

const notifMeta = (notif) => {
  const text = `${notif?.title || ''} ${notif?.message || ''}`.toLowerCase();
  if (notif?.type === 'BROADCAST') return { icon: <Megaphone size={18} />, bg: '#EEF2FF', color: '#4338CA' };
  if (notif?.type === 'LOW_STOCK') return { icon: <AlertTriangle size={18} />, bg: '#FEF3C7', color: '#B45309' };
  if (notif?.type === 'COMPLAINT_RESPONSE') return { icon: <MessageSquareWarning size={18} />, bg: '#FFE4E6', color: '#BE123C' };
  if (notif?.type === 'EXPENSE_REMINDER') return { icon: <Wallet size={18} />, bg: '#FEF3C7', color: '#B45309' };
  if (notif?.type === 'EXPENSE_PAID') return { icon: <Wallet size={18} />, bg: '#DBEAFE', color: '#1D4ED8' };
  if (notif?.type === 'EXPENSE_CHECKED') return { icon: <Wallet size={18} />, bg: '#DCFCE7', color: '#15803D' };
  if (notif?.type === 'EXECUTIVE_REVIEW') return { icon: <ShieldCheck size={18} />, bg: '#EDE9FE', color: '#6D28D9' };
  if (text.includes('rejected') || text.includes('not available')) return { icon: <XCircle size={18} />, bg: '#FEE2E2', color: '#DC2626' };
  if (text.includes('completed')) return { icon: <CheckCircle2 size={18} />, bg: '#DCFCE7', color: '#16A34A' };
  if (text.includes('ordered') || text.includes('approved') || text.includes('supplied') || text.includes('available')) return { icon: <Truck size={18} />, bg: '#E0F2FE', color: '#0369A1' };
  return { icon: <FileText size={18} />, bg: '#FFF7ED', color: ORANGE };
};

const StoreLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  useActivityTracker();

  const [notifications, setNotifications] = useState([]);
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const [userAnchorEl, setUserAnchorEl] = useState(null);
  const [notifTab, setNotifTab] = useState('ALL');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [expenseStatus, setExpenseStatus] = useState(null);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data || []);
    } catch (err) {
      console.error('Failed to load store notifications', err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    setSocketRoom(roomForUser(user));

    const handleNewNotif = (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
      toast.custom((t) => (
        <Box 
          onClick={() => { toast.dismiss(t.id); navigate(notificationTarget(newNotif, 'MINI_STORE')); }}
          sx={{
            bgcolor: '#FFFFFF',
            color: '#0F172A',
            border: '1px solid #E2E8F0',
            p: 2,
            borderRadius: 3,
            borderLeft: `4px solid ${ORANGE}`,
            boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            cursor: 'pointer',
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box'
          }}
        >
          <Bell size={20} color="#EA580C" style={{ flexShrink: 0 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" fontWeight="800" sx={{ overflowWrap: 'anywhere' }}>{newNotif.title}</Typography>
            <NotificationContext notif={newNotif} variant="store" showStore={false} showProduct sx={{ mb: 0.5 }} />
            <Typography variant="caption" sx={{ color: '#64748B', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{newNotif.message}</Typography>
          </Box>
        </Box>
      ));
    };

    const handleRequestUpdated = (data) => {
      if (data.approvalStage === 'FORWARDED') {
        toast.success(`Request ${data.requestId} approved by executive and sent to main branch`);
      } else if (data.approvalStage === 'REJECTED_BY_EXECUTIVE') {
        toast.error(`Request ${data.requestId} was rejected by the executive`);
      } else {
        toast.success(`Request ${data.requestId} is now ${data.status}`);
      }
      fetchNotifications();
    };

    socket.on('new_notification', handleNewNotif);
    socket.on('medicine_request_updated', handleRequestUpdated);

    return () => {
      socket.off('new_notification', handleNewNotif);
      socket.off('medicine_request_updated', handleRequestUpdated);
    };
  }, [user]);

  useEffect(() => {
    const handleRead = (e) => setNotifications((prev) => applyReadEvent(prev, e.detail));
    window.addEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    const loadExpenseStatus = () => api.get('/expenses/status').then((r) => setExpenseStatus(r.data)).catch(() => {});
    const onNotif = (n) => { if (String(n?.type || '').startsWith('EXPENSE_')) loadExpenseStatus(); };
    loadExpenseStatus();
    window.addEventListener(EXPENSES_CHANGED_EVENT, loadExpenseStatus);
    socket.on('new_notification', onNotif);
    return () => {
      window.removeEventListener(EXPENSES_CHANGED_EVENT, loadExpenseStatus);
      socket.off('new_notification', onNotif);
    };
  }, []);
  const expenseBadge = (expenseStatus?.reminder && expenseStatus.reminder.kind !== 'CURRENT' ? 1 : 0) + (expenseStatus?.toConfirm?.length || 0);

  const panelNotifications = (notifTab === 'UNREAD' ? notifications.filter(n => !n.isRead) : notifications).slice(0, 8);

  const handleOpenNotif = async (notif) => {
    setNotifAnchorEl(null);
    navigate(notificationTarget(notif, 'MINI_STORE'));
    if (!notif.isRead && notif._id) {
      setNotifications(prev => prev.map(n => (n._id === notif._id ? { ...n, isRead: true } : n)));
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
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      announceNotificationsRead();
      toast.success('Marked all as read');
    } catch (err) {
      console.error(err);
    }
  };

  const menuItems = [
    { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/store' },
    { text: 'Search Catalog', icon: <Search size={20} />, path: '/store/search' },
    { text: 'Branch Inventory', icon: <Package size={20} />, path: '/store/inventory' },
    { text: 'Requisition History', icon: <FileText size={20} />, path: '/store/requests' },
    { text: 'Main Branch Updates', icon: <Megaphone size={20} />, path: '/store/updates' },
    { text: 'Customer Complaints', icon: <MessageSquareWarning size={20} />, path: '/store/complaints' },
    { text: 'Monthly Expenses', icon: <Wallet size={20} />, path: '/store/expenses', badge: expenseBadge },
    { text: 'Create Requisition', icon: <PlusCircle size={20} />, path: '/store/create-request' },
    { text: 'Notifications', icon: <Bell size={20} />, path: '/store/notifications', badge: unreadCount },
  ];

  const activeItem = menuItems.find((item) => item.path === location.pathname);
  const storeCode = user?.store?.storeCode || user?.storeCode;
  const storeTitle = user?.store?.storeName || user?.name || 'Mini Store';
  const roleCaption = user?.employee?.designation || 'Mini Store Manager';
  const initial = user?.name?.charAt(0)?.toUpperCase() || 'S';

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#FFFFFF', borderRight: '1px solid #E2E8F0' }}>
      {/* Brand Header */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #F1F5F9' }}>
        <Box sx={{ bgcolor: ORANGE, p: 1.1, borderRadius: '12px', color: 'white', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <StoreIcon size={22} />
        </Box>
        <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
          <Typography fontWeight="800" sx={{ color: '#0F172A', lineHeight: 1.15, fontSize: '1rem' }} noWrap>
            {storeTitle}
          </Typography>
          <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: '0.74rem', mt: 0.3 }} noWrap>
            Branch Portal{storeCode ? ` · ${storeCode}` : ''}
          </Typography>
        </Box>
      </Box>

      {/* Quick Action Button */}
      <Box sx={{ p: 2, pb: 1 }}>
        <Button
          fullWidth
          variant="contained"
          color="secondary"
          startIcon={<PlusCircle size={18} />}
          onClick={() => { navigate('/store/create-request'); setMobileOpen(false); }}
          sx={{ py: 1.15, borderRadius: '10px', fontWeight: 800 }}
        >
          New Requisition
        </Button>
      </Box>

      {/* Navigation Links */}
      <List sx={{ flex: 1, px: 1.5, py: 1, overflowY: 'auto' }}>
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.text}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              sx={{
                borderRadius: '10px',
                mb: 0.5,
                py: 1.1,
                px: 1.75,
                bgcolor: active ? '#FFF7ED' : 'transparent',
                color: active ? ORANGE_DARK : '#475569',
                '&:hover': {
                  bgcolor: active ? '#FFEDD5' : '#F8FAFC',
                  color: active ? ORANGE_DARK : '#0F172A'
                },
                transition: 'background-color 0.15s ease'
              }}
            >
              <ListItemIcon sx={{ color: active ? ORANGE : '#94A3B8', minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText 
                primary={item.text} 
                slotProps={{ primary: { sx: { fontWeight: active ? 800 : 600, fontSize: '0.9rem' } } }}
              />
              {item.badge > 0 && (
                <Box sx={{ bgcolor: ORANGE, color: 'white', borderRadius: '99px', px: 1, py: 0.2, fontSize: '0.72rem', fontWeight: 800 }}>
                  {item.badge}
                </Box>
              )}
            </ListItemButton>
          );
        })}
      </List>

      {/* Footer User Info */}
      <Box sx={{ p: 2, borderTop: '1px solid #F1F5F9' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 1 }}>
          <Avatar sx={{ bgcolor: ORANGE, width: 36, height: 36, fontWeight: 800, fontSize: '0.9rem' }}>
            {initial}
          </Avatar>
          <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight="800" color="#0F172A" noWrap>{user?.name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{roleCaption}</Typography>
          </Box>
        </Box>
        <ListItemButton 
          onClick={logout} 
          sx={{ borderRadius: '10px', color: '#DC2626', bgcolor: '#FEF2F2', '&:hover': { bgcolor: '#FEE2E2' } }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><LogOut size={18} /></ListItemIcon>
          <ListItemText primary="Sign Out" slotProps={{ primary: { sx: { fontWeight: 800, fontSize: '0.85rem' } } }} />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={storeTheme}>
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F8FAFC' }}>
      {/* App Bar */}
      <AppBar 
        position="fixed" 
        sx={{ 
          width: { sm: `calc(100% - ${drawerWidth}px)` }, 
          ml: { sm: `${drawerWidth}px` }, 
          bgcolor: 'rgba(255, 255, 255, 0.92)', 
          backdropFilter: 'blur(12px)',
          color: '#0F172A', 
          boxShadow: 'none', 
          borderBottom: '1px solid #E2E8F0',
          zIndex: (theme) => theme.zIndex.drawer + 1
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ display: { sm: 'none' }, bgcolor: '#FFF7ED', color: ORANGE_DARK, '&:hover': { bgcolor: '#FFEDD5' } }}>
              <MenuIcon size={20} />
            </IconButton>

            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: '#94A3B8', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.6px', textTransform: 'uppercase', lineHeight: 1.2 }} noWrap>
                {storeTitle}{user?.employee ? ` · ${user.name}` : ''}
              </Typography>
              <Typography fontWeight="800" sx={{ color: '#0F172A', fontSize: { xs: '0.98rem', sm: '1.1rem' }, lineHeight: 1.25 }} noWrap>
                {activeItem?.text || 'Branch Portal'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, flexShrink: 0 }}>
            <Button
              variant="contained"
              color="secondary"
              size="small"
              startIcon={<PlusCircle size={16} />}
              onClick={() => navigate('/store/create-request')}
              sx={{ display: { xs: 'none', md: 'inline-flex' }, borderRadius: '10px', fontWeight: 800, px: 2 }}
            >
              New Request
            </Button>

            <Tooltip title="Notifications">
              <IconButton 
                onClick={(e) => { setNotifTab('ALL'); setNotifAnchorEl(e.currentTarget); }} 
                sx={{
                  bgcolor: notifAnchorEl ? ORANGE : '#FFF7ED',
                  color: notifAnchorEl ? '#FFFFFF' : ORANGE_DARK,
                  '&:hover': { bgcolor: notifAnchorEl ? ORANGE_DARK : '#FFEDD5' },
                  p: 1.1
                }}
              >
                <Badge badgeContent={unreadCount} color="error" max={99}>
                  <Bell size={20} />
                </Badge>
              </IconButton>
            </Tooltip>

            <Popover
              open={Boolean(notifAnchorEl)}
              anchorEl={notifAnchorEl}
              onClose={() => setNotifAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{
                sx: {
                  width: 380,
                  maxWidth: 'calc(100vw - 24px)',
                  mt: 1.25,
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 20px 48px -16px rgba(15, 23, 42, 0.28)'
                }
              }}
            >
              {/* Header */}
              <Box sx={{ px: 2.25, pt: 2, pb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.02rem' }}>Notifications</Typography>
                    {unreadCount > 0 && (
                      <Box sx={{ px: 0.9, py: 0.15, borderRadius: '99px', bgcolor: ORANGE, color: '#FFFFFF', fontSize: '0.68rem', fontWeight: 800 }}>
                        {unreadCount} new
                      </Box>
                    )}
                  </Box>
                  <Tooltip title="Mark all as read">
                    <span>
                      <Button
                        size="small"
                        startIcon={<CheckCheck size={15} />}
                        disabled={unreadCount === 0}
                        onClick={handleMarkAllRead}
                        sx={{ color: ORANGE, fontWeight: 800, fontSize: '0.76rem', px: 1, py: 0.4, minWidth: 0, borderRadius: '8px', '&:hover': { bgcolor: '#FFF7ED' } }}
                      >
                        Mark all read
                      </Button>
                    </span>
                  </Tooltip>
                </Box>

                {/* Tabs */}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, p: 0.5, bgcolor: '#F1F5F9', borderRadius: '10px' }}>
                  {[
                    { id: 'ALL', label: `All (${notifications.length})` },
                    { id: 'UNREAD', label: `Unread (${unreadCount})` }
                  ].map((tab) => (
                    <Box
                      key={tab.id}
                      component="button"
                      type="button"
                      onClick={() => setNotifTab(tab.id)}
                      sx={{
                        flex: 1,
                        border: 0,
                        cursor: 'pointer',
                        py: 0.75,
                        borderRadius: '8px',
                        fontFamily: 'inherit',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        bgcolor: notifTab === tab.id ? '#FFFFFF' : 'transparent',
                        color: notifTab === tab.id ? ORANGE_DARK : '#64748B',
                        boxShadow: notifTab === tab.id ? '0 1px 3px rgba(15, 23, 42, 0.12)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tab.label}
                    </Box>
                  ))}
                </Box>
              </Box>

              <Divider />

              {/* List */}
              <Box sx={{ maxHeight: { xs: '55vh', sm: 380 }, overflowY: 'auto' }}>
                {panelNotifications.length === 0 ? (
                  <Box sx={{ py: 5, px: 3, textAlign: 'center' }}>
                    <Box sx={{ width: 52, height: 52, borderRadius: '16px', bgcolor: '#FFF7ED', color: ORANGE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 1.25 }}>
                      <BellOff size={22} />
                    </Box>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>
                      {notifTab === 'UNREAD' ? "You're all caught up" : 'No notifications yet'}
                    </Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.8rem', mt: 0.4 }}>
                      {notifTab === 'UNREAD' ? 'No unread notifications right now.' : 'Updates from the main branch will show here.'}
                    </Typography>
                  </Box>
                ) : (
                  panelNotifications.map((notif) => {
                    const meta = notifMeta(notif);
                    return (
                      <Box 
                        key={notif._id} 
                        onClick={() => handleOpenNotif(notif)}
                        sx={{ 
                          display: 'flex',
                          gap: 1.5,
                          px: 2.25,
                          py: 1.5,
                          cursor: 'pointer',
                          position: 'relative',
                          bgcolor: notif.isRead ? '#FFFFFF' : '#FFFAF5',
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background-color 0.15s ease',
                          '&:hover': { bgcolor: '#F8FAFC' },
                          '&:last-of-type': { borderBottom: 0 }
                        }}
                      >
                        <Box sx={{ width: 38, height: 38, borderRadius: '11px', bgcolor: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {meta.icon}
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                            <Typography sx={{ fontWeight: notif.isRead ? 700 : 800, color: '#0F172A', fontSize: '0.86rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                              {notif.title}
                            </Typography>
                            {!notif.isRead && (
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ORANGE, flexShrink: 0, mt: 0.6 }} />
                            )}
                          </Box>
                          <NotificationContext notif={notif} variant="store" showStore={false} showProduct sx={{ mt: 0.5 }} />
                          <Typography sx={{ color: '#64748B', fontSize: '0.79rem', mt: 0.3, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                            {notif.message}
                          </Typography>
                          <Typography sx={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: 700, mt: 0.5 }}>
                            {timeAgo(notif.createdAt)}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })
                )}
              </Box>

              <Divider />

              {/* Footer */}
              <Box sx={{ p: 1.25 }}>
                <Button
                  fullWidth
                  endIcon={<ArrowRight size={16} />}
                  onClick={() => { setNotifAnchorEl(null); navigate('/store/notifications'); }}
                  sx={{ color: ORANGE_DARK, fontWeight: 800, fontSize: '0.84rem', borderRadius: '10px', py: 0.9, '&:hover': { bgcolor: '#FFF7ED' } }}
                >
                  View all notifications
                </Button>
              </Box>
            </Popover>

            <IconButton onClick={(e) => setUserAnchorEl(e.currentTarget)} sx={{ p: 0.4, border: '2px solid #FED7AA' }}>
              <Avatar sx={{ bgcolor: ORANGE, width: 34, height: 34, fontWeight: 800, fontSize: '0.9rem' }}>
                {initial}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={userAnchorEl}
              open={Boolean(userAnchorEl)}
              onClose={() => setUserAnchorEl(null)}
              PaperProps={{ sx: { borderRadius: 3, minWidth: 200, mt: 1 } }}
            >
              <MenuItem disabled sx={{ opacity: '1 !important' }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="800">{user?.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{roleCaption.toUpperCase()}{storeCode ? ` · ${storeCode}` : ''}</Typography>
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

      {/* Drawer */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, border: 'none' }
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, border: 'none' }
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Container with Toolbar Spacer */}
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, sm: 3, md: 4 }, width: { xs: '100%', sm: `calc(100% - ${drawerWidth}px)` }, minWidth: 0, minHeight: '100vh' }}>
        <Toolbar />
        <Outlet />
        <Box sx={{ height: 72 }} />
      </Box>
      <AskAI />
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Box>
    </ThemeProvider>
  );
};

export default StoreLayout;
