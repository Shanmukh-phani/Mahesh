import React, { useContext, useState, useEffect } from 'react';
import { 
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, 
  AppBar, Toolbar, IconButton, Avatar, Badge, Popover, Divider, Menu, MenuItem, Tooltip 
} from '@mui/material';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, FileText, BarChart3, Package, Store, Users, Bell, 
  LogOut, Menu as MenuIcon, Activity, AlertTriangle, Info, Volume2
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import socket, { setSocketRoom } from '../services/socket';
import toast from 'react-hot-toast';
import { notificationTarget, announceNotificationsRead, applyReadEvent, NOTIFICATIONS_READ_EVENT } from '../utils/notificationLinks';
import AskAI from './AskAI';

const drawerWidth = 270;

const AdminLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState([]);
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const [userAnchorEl, setUserAnchorEl] = useState(null);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    setSocketRoom('ADMIN_ROOM');

    const handleNewNotif = (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
      toast.custom((t) => (
        <Box 
          onClick={() => { toast.dismiss(t.id); navigate(notificationTarget(newNotif, 'ADMIN')); }}
          sx={{
            bgcolor: '#0F172A',
            color: 'white',
            p: 2,
            borderRadius: 3,
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            cursor: 'pointer',
            maxWidth: 380
          }}
        >
          <Bell size={20} color="#2DD4BF" />
          <Box>
            <Typography variant="subtitle2" fontWeight="800">{newNotif.title}</Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8' }}>{newNotif.message}</Typography>
          </Box>
        </Box>
      ));
    };

    const handleRequestCreated = () => {
      fetchNotifications();
    };

    socket.on('new_notification', handleNewNotif);
    socket.on('medicine_request_created', handleRequestCreated);

    return () => {
      socket.off('new_notification', handleNewNotif);
      socket.off('medicine_request_created', handleRequestCreated);
    };
  }, []);

  useEffect(() => {
    const handleRead = (e) => setNotifications((prev) => applyReadEvent(prev, e.detail));
    window.addEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleOpenNotif = async (notif) => {
    setNotifAnchorEl(null);
    navigate(notificationTarget(notif, 'ADMIN'));
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
    { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/admin' },
    { text: 'Medicine Requests', icon: <FileText size={20} />, path: '/admin/requests' },
    { text: 'Medicine Demand', icon: <BarChart3 size={20} />, path: '/admin/demand' },
    { text: 'Main Inventory', icon: <Package size={20} />, path: '/admin/inventory' },
    { text: 'Mini Stores', icon: <Store size={20} />, path: '/admin/stores' },
    { text: 'Customers', icon: <Users size={20} />, path: '/admin/customers' },
    { text: 'Notifications', icon: <Bell size={20} />, path: '/admin/notifications', badge: unreadCount },
  ];

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#FFFFFF', borderRight: '1px solid #E2E8F0' }}>
      {/* Brand Header */}
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid #E2E8F0' }}>
        <Box sx={{ 
          background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)', 
          p: 1.2, 
          borderRadius: '12px', 
          color: 'white',
          boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Activity size={24} />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight="800" sx={{ color: '#0F172A', lineHeight: 1.1 }}>MedAdmin</Typography>
          <Typography variant="caption" color="text.secondary" fontWeight="700">Central Warehouse</Typography>
        </Box>
      </Box>

      {/* Navigation Links */}
      <List sx={{ flex: 1, px: 2, py: 2.5 }}>
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
                borderRadius: '12px',
                mb: 1,
                py: 1.2,
                px: 2,
                bgcolor: active ? '#0D9488' : 'transparent',
                color: active ? 'white' : '#475569',
                boxShadow: active ? '0 4px 12px rgba(13, 148, 136, 0.25)' : 'none',
                '&:hover': {
                  bgcolor: active ? '#0F766E' : '#F1F5F9',
                  color: active ? 'white' : '#0F172A'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText 
                primary={item.text} 
                primaryTypographyProps={{ fontWeight: active ? 800 : 600, fontSize: '0.9rem' }} 
              />
              {item.badge > 0 && (
                <Box sx={{ 
                  bgcolor: active ? 'white' : '#EF4444', 
                  color: active ? '#0D9488' : 'white', 
                  borderRadius: '99px', 
                  px: 1, 
                  py: 0.2, 
                  fontSize: '0.72rem', 
                  fontWeight: 800 
                }}>
                  {item.badge}
                </Box>
              )}
            </ListItemButton>
          );
        })}
      </List>

      {/* Footer User Info */}
      <Box sx={{ p: 2, borderTop: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 1, borderRadius: 2 }}>
          <Avatar sx={{ bgcolor: '#0D9488', width: 36, height: 36, fontWeight: 800, fontSize: '0.9rem' }}>
            {user?.name?.charAt(0) || 'A'}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="subtitle2" fontWeight="800" color="#0F172A" noWrap>{user?.name || 'Administrator'}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>Central Admin</Typography>
          </Box>
        </Box>
        <ListItemButton 
          onClick={logout} 
          sx={{ 
            borderRadius: '10px', 
            color: '#EF4444', 
            bgcolor: '#FEF2F2',
            '&:hover': { bgcolor: '#FEE2E2' } 
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}><LogOut size={18} /></ListItemIcon>
          <ListItemText primary="Sign Out" primaryTypographyProps={{ fontWeight: 800, fontSize: '0.85rem' }} />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F8FAFC' }}>
      {/* Top Navbar */}
      <AppBar 
        position="fixed" 
        sx={{ 
          width: { sm: `calc(100% - ${drawerWidth}px)` }, 
          ml: { sm: `${drawerWidth}px` }, 
          bgcolor: 'rgba(255, 255, 255, 0.95)', 
          backdropFilter: 'blur(10px)',
          color: '#0F172A', 
          boxShadow: 'none', 
          borderBottom: '1px solid #E2E8F0',
          zIndex: (theme) => theme.zIndex.drawer + 1
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" fontWeight="800" sx={{ display: { xs: 'none', sm: 'block' }, color: '#0F172A' }}>
            Central Warehouse & Requisition Portal
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Tooltip title={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}>
              <IconButton
                onClick={(e) => setNotifAnchorEl(e.currentTarget)}
                sx={{
                  width: 44,
                  height: 44,
                  bgcolor: unreadCount ? '#CCFBF1' : '#F1F5F9',
                  border: unreadCount ? '1.5px solid #0D9488' : '1.5px solid #CBD5E1',
                  '&:hover': { bgcolor: '#99F6E4', borderColor: '#0D9488' }
                }}
              >
                <Badge
                  badgeContent={unreadCount}
                  color="error"
                  overlap="circular"
                  sx={{ '& .MuiBadge-badge': { top: -2, right: -2 } }}
                >
                  <Bell size={21} color="#0F766E" strokeWidth={2.4} />
                </Badge>
              </IconButton>
            </Tooltip>

            <Popover
              open={Boolean(notifAnchorEl)}
              anchorEl={notifAnchorEl}
              onClose={() => setNotifAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: { width: 380, p: 2, mt: 1 }
                }
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, px: 0.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Notifications</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 700 }}>
                    {unreadCount ? `${unreadCount} unread` : 'All caught up'}
                  </Typography>
                </Box>
                {unreadCount > 0 && (
                  <Typography
                    sx={{ color: '#0D9488', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem' }}
                    onClick={handleMarkAllRead}
                  >
                    Mark all read
                  </Typography>
                )}
              </Box>
              <Divider sx={{ mb: 1.25 }} />
              <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Box sx={{ width: 44, height: 44, mx: 'auto', mb: 1, borderRadius: '12px', bgcolor: '#CCFBF1', color: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bell size={20} />
                    </Box>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>No notifications yet</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: '0.8rem', mt: 0.4 }}>New branch requests will appear here</Typography>
                  </Box>
                ) : (
                  notifications.slice(0, 5).map((notif) => {
                    const tone = notif.type === 'BROADCAST'
                      ? { icon: <Volume2 size={16} />, bg: '#E0E7FF', color: '#3730A3' }
                      : notif.type === 'LOW_STOCK'
                        ? { icon: <AlertTriangle size={16} />, bg: '#FEE2E2', color: '#991B1B' }
                        : { icon: <Info size={16} />, bg: '#CCFBF1', color: '#0F766E' };
                    return (
                      <Box
                        key={notif._id}
                        onClick={() => handleOpenNotif(notif)}
                        sx={{
                          p: 1.25,
                          mb: 0.75,
                          borderRadius: '12px',
                          display: 'flex',
                          gap: 1.25,
                          bgcolor: notif.isRead ? '#F8FAFC' : '#F0FDFA',
                          border: notif.isRead ? '1px solid #E2E8F0' : '1px solid #99F6E4',
                          cursor: 'pointer',
                          '&:hover': { bgcolor: '#CCFBF1', borderColor: '#0D9488' }
                        }}
                      >
                        <Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: tone.bg, color: tone.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {tone.icon}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.82rem' }} noWrap>{notif.title}</Typography>
                          <Typography sx={{ color: '#64748B', fontSize: '0.75rem', mt: 0.25 }} noWrap>{notif.message}</Typography>
                        </Box>
                      </Box>
                    );
                  })
                )}
              </Box>
              <Divider sx={{ my: 1.25 }} />
              <Box
                onClick={() => { setNotifAnchorEl(null); navigate('/admin/notifications'); }}
                sx={{ textAlign: 'center', py: 0.75, cursor: 'pointer', color: '#0D9488', fontWeight: 800, fontSize: '0.85rem', borderRadius: '10px', '&:hover': { bgcolor: '#F0FDFA' } }}
              >
                View all notifications →
              </Box>
            </Popover>

            <IconButton
              onClick={(e) => setUserAnchorEl(e.currentTarget)}
              sx={{
                p: 0.4,
                border: '1.5px solid #99F6E4',
                '&:hover': { bgcolor: '#F0FDFA' }
              }}
            >
              <Avatar sx={{ bgcolor: '#0D9488', width: 36, height: 36, fontWeight: 800, fontSize: '0.95rem' }}>
                {user?.name?.charAt(0) || 'A'}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={userAnchorEl}
              open={Boolean(userAnchorEl)}
              onClose={() => setUserAnchorEl(null)}
              slotProps={{ paper: { sx: { minWidth: 200 } } }}
            >
              <MenuItem disabled sx={{ opacity: '1 !important', alignItems: 'flex-start' }}>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>{user?.name}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#0D9488' }}>ADMIN</Typography>
                </Box>
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={logout} sx={{ color: '#DC2626', fontWeight: 800 }}>
                <LogOut size={16} style={{ marginRight: 8 }} /> Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Side Navigation Drawer */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: '1px solid #E2E8F0' }
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main View Container with Toolbar Spacer to prevent top overlapping */}
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3.5, md: 4 }, width: { sm: `calc(100% - ${drawerWidth}px)` }, minHeight: '100vh' }}>
        <Toolbar />
        <Outlet />
        <Box sx={{ height: 72 }} />
      </Box>
      <AskAI />
    </Box>
  );
};

export default AdminLayout;
