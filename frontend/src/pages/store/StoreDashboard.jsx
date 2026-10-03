import React, { useEffect, useState, useContext } from 'react';
import { 
  Box, Typography, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Chip, Button, CircularProgress 
} from '@mui/material';
import { FileText, Clock, Calendar, PlusCircle, ArrowRight, Search, Package, Bell, ChevronRight, User } from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import socket from '../../services/socket';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

import RequestDetailsModal from '../../components/RequestDetailsModal';
import { StatCard, EmptyState, statusChipClass } from '../../components/admin/AdminChrome';

const ORANGE = '#EA580C';
const ORANGE_DARK = '#C2410C';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const QUICK_LINKS = [
  { label: 'Search catalog', hint: 'Find medicines fast', icon: <Search size={20} />, path: '/store/search', bg: '#FFF7ED', color: ORANGE },
  { label: 'Branch inventory', hint: 'Shelf stock levels', icon: <Package size={20} />, path: '/store/inventory', bg: '#FFF7ED', color: ORANGE },
  { label: 'Request history', hint: 'Track every order', icon: <FileText size={20} />, path: '/store/requests', bg: '#FFF7ED', color: ORANGE },
  { label: 'Notifications', hint: 'Updates from main branch', icon: <Bell size={20} />, path: '/store/notifications', bg: '#FFF7ED', color: ORANGE }
];

const StoreDashboard = () => {
  const { user } = useContext(AuthContext);
  const [metrics, setMetrics] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Details Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedReqForDetails, setSelectedReqForDetails] = useState(null);
  const navigate = useNavigate();

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests/ministore-metrics');
      setMetrics(res.data);

      const reqRes = await api.get('/requests');
      setRecentRequests(reqRes.data ? reqRes.data.slice(0, 6) : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchDashboard);

  useEffect(() => {
    fetchDashboard();

    const handleRequestUpdated = () => {
      fetchDashboard();
    };

    socket.on('medicine_request_updated', handleRequestUpdated);

    return () => {
      socket.off('medicine_request_updated', handleRequestUpdated);
    };
  }, []);

  const openDetails = (req) => {
    setSelectedReqForDetails(req);
    setDetailsModalOpen(true);
  };

  const storeCode = user?.store?.storeCode;

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      {/* Hero Header */}
      <Card className="white-card" sx={{ 
        p: { xs: 2.5, sm: 3, md: 3.5 }, 
        borderRadius: '18px', 
        mb: { xs: 2.5, md: 3 },
        borderLeft: `4px solid ${ORANGE} !important`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', md: 'center' },
        flexDirection: { xs: 'column', md: 'row' },
        gap: { xs: 2, md: 3 }
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <span className="live-pulse-dot" style={{ backgroundColor: '#22C55E' }} />
            <Typography sx={{ color: '#64748B', fontWeight: 800, letterSpacing: '0.5px', fontSize: '0.7rem' }}>
              BRANCH ONLINE{storeCode ? ` • ${storeCode}` : ''}
            </Typography>
          </Box>
          <Typography fontWeight="800" color="#0F172A" sx={{ fontSize: { xs: '1.35rem', sm: '1.6rem', md: '1.9rem' }, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            {greeting()}, {user?.name || 'Store Branch Manager'}
          </Typography>
          <Typography sx={{ color: '#64748B', mt: 0.75, maxWidth: 620, fontSize: { xs: '0.86rem', md: '0.94rem' }, lineHeight: 1.6 }}>
            Request medicine supply from the central warehouse, check shelf stock and track patient orders in one place.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<Search size={18} />}
            onClick={() => navigate('/store/search')}
            sx={{ flex: { xs: 1, md: 'none' }, fontWeight: 800, borderRadius: '10px', px: 2.5, py: 1.1, whiteSpace: 'nowrap' }}
          >
            Search
          </Button>

          <Button
            variant="contained"
            color="secondary"
            startIcon={<PlusCircle size={18} />}
            onClick={() => navigate('/store/create-request')}
            sx={{ flex: { xs: 1, md: 'none' }, fontWeight: 800, borderRadius: '10px', px: 3, py: 1.1, whiteSpace: 'nowrap' }}
          >
            New Requisition
          </Button>
        </Box>
      </Card>

      {/* Metrics */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: { xs: 1.5, md: 2.5 }, mb: { xs: 2.5, md: 3.5 } }}>
        <StatCard title="Total requisitions" value={metrics?.totalRequests ?? 0} hint="Branch total requests" accent={ORANGE} icon={<FileText size={20} />} />
        <StatCard title="Pending delivery" value={metrics?.pendingRequests ?? 0} hint="Awaiting warehouse dispatch" accent="#D97706" icon={<Clock size={20} />} />
        <StatCard title="Today's requests" value={metrics?.todaysRequests ?? 0} hint="Logged today" accent="#059669" icon={<Calendar size={20} />} />
      </Box>

      {/* Quick Links */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: { xs: 1.5, md: 2 }, mb: { xs: 2.5, md: 3.5 } }}>
        {QUICK_LINKS.map((link) => (
          <Card
            key={link.path}
            className="white-card white-card-hover"
            onClick={() => navigate(link.path)}
            sx={{ p: { xs: 1.75, md: 2.25 }, borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}
          >
            <Box sx={{ width: 42, height: 42, borderRadius: '12px', bgcolor: link.bg, color: link.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {link.icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: '0.84rem', md: '0.92rem' } }} noWrap>{link.label}</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.74rem', display: { xs: 'none', sm: 'block' } }} noWrap>{link.hint}</Typography>
            </Box>
            <ChevronRight size={18} color="#CBD5E1" style={{ flexShrink: 0 }} />
          </Card>
        ))}
      </Box>

      {/* Recent Requests */}
      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.75 }, px: { xs: 2, md: 3.5 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, borderBottom: '1px solid #E2E8F0' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight="800" color="#0F172A" sx={{ fontSize: { xs: '1rem', md: '1.1rem' } }}>Recent requisitions</Typography>
            <Typography sx={{ color: '#64748B', fontSize: '0.78rem', display: { xs: 'none', sm: 'block' } }}>Tap a row to see full details</Typography>
          </Box>
          <Button 
            variant="text" 
            endIcon={<ArrowRight size={16} />} 
            onClick={() => navigate('/store/requests')}
            sx={{ fontWeight: 800, color: ORANGE, flexShrink: 0, '&:hover': { bgcolor: '#FFF7ED' } }}
          >
            View all
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={30} /></Box>
        ) : recentRequests.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No requests yet" text="Your branch requisitions will appear here once you submit one." />
        ) : (
          <>
            {/* Mobile cards */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', p: 1.5, gap: 1.25 }}>
              {recentRequests.map((req) => (
                <Box
                  key={req._id}
                  onClick={() => openDetails(req)}
                  sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#FFFFFF', cursor: 'pointer', '&:active': { bgcolor: '#FFF7ED' } }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: ORANGE, fontSize: '0.82rem' }}>{req.requestId}</Typography>
                    <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                  </Box>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem' }}>
                    {req.productName || req.medicineName}
                    <Box component="span" sx={{ color: ORANGE_DARK, fontWeight: 800, ml: 1, fontSize: '0.8rem' }}>× {req.quantity}</Box>
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ color: '#475569', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <User size={13} /> {req.customer?.name || 'Walk-in'} {req.customer?.phone ? `· ${req.customer.phone}` : ''}
                    </Typography>
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.74rem', fontWeight: 600 }}>
                      {format(new Date(req.createdAt), 'dd MMM, p')}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Desktop table */}
            <TableContainer sx={{ display: { xs: 'none', md: 'block' }, width: '100%', overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 3.5 }}>Request ID</TableCell>
                    <TableCell>Requested Date</TableCell>
                    <TableCell>Medicine Name</TableCell>
                    <TableCell align="center">Quantity</TableCell>
                    <TableCell>Patient Details</TableCell>
                    <TableCell align="center" sx={{ pr: 3.5 }}>Fulfillment Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentRequests.map((req) => (
                    <TableRow 
                      key={req._id} 
                      hover
                      onClick={() => openDetails(req)}
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FFF7ED !important' } }}
                    >
                      <TableCell sx={{ pl: 3.5, fontWeight: 800, color: ORANGE }}>{req.requestId}</TableCell>
                      <TableCell sx={{ color: '#475569' }}>{format(new Date(req.createdAt), 'dd MMM yyyy, p')}</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#0F172A' }}>{req.productName || req.medicineName}</TableCell>
                      <TableCell align="center">
                        <Box component="span" sx={{ px: 1.25, py: 0.4, borderRadius: '8px', bgcolor: '#FFF7ED', color: ORANGE_DARK, fontWeight: 800, fontSize: '0.85rem' }}>
                          {req.quantity}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                          <Typography variant="body2" fontWeight="700" color="#0F172A">{req.customer?.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{req.customer?.phone}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={{ pr: 3.5 }}>
                        <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Card>

      {/* Details View Modal */}
      <RequestDetailsModal 
        open={detailsModalOpen} 
        onClose={() => setDetailsModalOpen(false)} 
        request={selectedReqForDetails} 
        userRole="MINI_STORE"
      />
    </Box>
  );
};

export default StoreDashboard;
