import React, { useContext, useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, CircularProgress, LinearProgress
} from '@mui/material';
import {
  Store, FileText, Clock, Package, TrendingUp, AlertTriangle, ArrowRight,
  RefreshCw, BarChart3, Users, CheckCircle2, Activity
} from 'lucide-react';
import api from '../../services/api';
import useAIRefresh from '../../utils/useAIRefresh';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area, PieChart, Pie
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AuthContext } from '../../context/AuthContext';
import RequestDetailsModal from '../../components/RequestDetailsModal';

const COLORS = ['#0D9488', '#2563EB', '#F59E0B', '#EC4899', '#8B5CF6'];

const statusChipClass = (status = '') =>
  `badge-chip status-${status.toLowerCase().replace(/[^a-z]/g, '')}`;

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const StatCard = ({ title, value, subtitle, icon, accent, onClick }) => (
  <Card
    onClick={onClick}
    className="white-card white-card-hover"
    sx={{
      p: { xs: 2.25, md: 2.75 },
      borderRadius: '18px',
      cursor: onClick ? 'pointer' : 'default',
      height: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: accent }} />
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', fontSize: '0.7rem', mb: 1 }}>
          {title}
        </Typography>
        <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: '1.85rem', md: '2.15rem' }, lineHeight: 1, letterSpacing: '-0.04em' }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography sx={{ mt: 1.1, color: '#475569', fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.4 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '14px',
          bgcolor: `${accent}14`,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {icon}
      </Box>
    </Box>
  </Card>
);

const ChartTooltip = ({ active, payload, label, valueLabel = 'Count' }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: '#FFFFFF', p: 1.5, borderRadius: 2, border: '1px solid #E2E8F0', boxShadow: '0 10px 24px rgba(15,23,42,0.1)' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', color: '#0F172A' }}>{label}</Typography>
      <Typography sx={{ color: '#0D9488', fontWeight: 700, fontSize: '0.78rem', mt: 0.4 }}>
        {valueLabel}: {payload[0].value}
      </Typography>
    </Box>
  );
};

const EmptyPanel = ({ icon, title, text }) => (
  <Box sx={{ height: '100%', minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 3 }}>
    <Box sx={{ width: 56, height: 56, borderRadius: '16px', bgcolor: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
      {icon}
    </Box>
    <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.5 }}>{title}</Typography>
    <Typography sx={{ color: '#64748B', fontSize: '0.85rem', maxWidth: 280 }}>{text}</Typography>
  </Box>
);

const AdminDashboard = () => {
  const { user } = useContext(AuthContext);
  const [metrics, setMetrics] = useState(null);
  const [storeMetrics, setStoreMetrics] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedReqForDetails, setSelectedReqForDetails] = useState(null);
  const navigate = useNavigate();

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const [reqMetrics, storesRes, recent, invRes] = await Promise.allSettled([
        api.get('/requests/dashboard-metrics'),
        api.get('/stores'),
        api.get('/requests'),
        api.get('/inventory/main')
      ]);

      if (reqMetrics.status === 'fulfilled') {
        setMetrics(reqMetrics.value.data || {});
      }

      if (storesRes.status === 'fulfilled') {
        const stores = storesRes.value.data || [];
        setStoreMetrics({
          totalStores: stores.length,
          activeStores: stores.filter((s) => s.status !== 'Inactive' && s.isActive !== false).length
        });
      }

      if (recent.status === 'fulfilled') {
        setRecentRequests(recent.value.data ? recent.value.data.slice(0, 6) : []);
      }

      if (invRes.status === 'fulfilled') {
        const lowStock = (invRes.value.data || [])
          .filter((i) => i.quantity <= (i.minReorderLevel || 50))
          .slice(0, 4);
        setLowStockItems(lowStock);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useAIRefresh(fetchDashboard);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const totalRequests = metrics?.totalRequests ?? 0;
  const pendingRequests = metrics?.pendingRequests ?? 0;
  const completedRequests = metrics?.completedRequests ?? 0;
  const fillRate = totalRequests ? Math.round((completedRequests / totalRequests) * 100) : 0;
  const topMedicines = metrics?.topMedicines || [];
  const storeRequests = metrics?.storeRequests || [];
  const pieData = [
    { name: 'Completed', value: completedRequests, color: '#10B981' },
    { name: 'Pending', value: pendingRequests, color: '#F59E0B' },
    { name: 'Other', value: Math.max(0, totalRequests - completedRequests - pendingRequests), color: '#94A3B8' }
  ].filter((d) => d.value > 0);

  const quickActions = [
    { label: 'Review requests', icon: <FileText size={16} />, path: '/admin/requests', color: '#0D9488' },
    { label: 'Mini stores', icon: <Store size={16} />, path: '/admin/stores', color: '#0F766E' },
    { label: 'Warehouse', icon: <Package size={16} />, path: '/admin/inventory', color: '#7C3AED' },
    { label: 'Demand report', icon: <BarChart3 size={16} />, path: '/admin/demand', color: '#D97706' }
  ];

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          p: { xs: 2.5, sm: 3.25, md: 4 },
          mb: 3,
          borderRadius: '22px',
          color: 'white',
          background: 'linear-gradient(135deg, #042F2E 0%, #0F766E 55%, #0D9488 100%)',
          boxShadow: '0 16px 40px -16px rgba(13, 148, 136, 0.55)'
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              radial-gradient(circle at 88% 18%, rgba(255,255,255,0.14) 0%, transparent 28%),
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: 'auto, 42px 42px, 42px 42px',
            pointerEvents: 'none'
          }}
        />

        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexWrap: 'wrap', gap: 2.5 }}>
          <Box sx={{ maxWidth: 720 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, flexWrap: 'wrap' }}>
              <span className="live-pulse-dot" />
              <Typography sx={{ color: '#99F6E4', fontWeight: 800, letterSpacing: '0.7px', fontSize: '0.72rem' }}>
                CENTRAL COMMAND · {format(new Date(), 'EEEE, d MMM yyyy')}
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.55rem', sm: '2rem', md: '2.25rem' }, letterSpacing: '-0.04em', lineHeight: 1.15 }}>
              {greetingForHour(new Date().getHours())}, {user?.name || 'Administrator'}
            </Typography>
            <Typography sx={{ mt: 1, color: 'rgba(204,251,241,0.92)', maxWidth: 560, fontSize: { xs: '0.88rem', md: '0.95rem' }, lineHeight: 1.6 }}>
              Warehouse, branch requisitions, and fulfillment in one view. Jump into whatever needs action first.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<RefreshCw size={16} />}
              onClick={fetchDashboard}
              sx={{
                borderColor: 'rgba(255,255,255,0.35)',
                color: 'white',
                fontWeight: 800,
                borderRadius: '12px',
                px: 2,
                '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.08)' }
              }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              endIcon={<ArrowRight size={16} />}
              onClick={() => navigate('/admin/requests')}
              sx={{
                bgcolor: 'white',
                color: '#0F766E',
                fontWeight: 800,
                borderRadius: '12px',
                px: 2.25,
                boxShadow: 'none',
                '&:hover': { bgcolor: '#F8FAFC' }
              }}
            >
              {pendingRequests > 0 ? `Review ${pendingRequests} pending` : 'Open requests'}
            </Button>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: 2,
          mb: 3
        }}
      >
        <StatCard
          title="Mini stores"
          value={storeMetrics?.totalStores ?? 0}
          subtitle={`${storeMetrics?.activeStores ?? 0} active branches connected`}
          icon={<Store size={22} />}
          accent="#0D9488"
          onClick={() => navigate('/admin/stores')}
        />
        <StatCard
          title="Requisitions"
          value={totalRequests}
          subtitle="All branch medicine requests"
          icon={<FileText size={22} />}
          accent="#2563EB"
          onClick={() => navigate('/admin/requests')}
        />
        <StatCard
          title="Needs action"
          value={pendingRequests}
          subtitle={pendingRequests ? 'Pending review at main branch' : 'Inbox is clear'}
          icon={<Clock size={22} />}
          accent="#D97706"
          onClick={() => navigate('/admin/requests')}
        />
        <StatCard
          title="Fulfilled"
          value={completedRequests}
          subtitle={totalRequests ? `${fillRate}% completion rate` : 'No completed supplies yet'}
          icon={<CheckCircle2 size={22} />}
          accent="#059669"
          onClick={() => navigate('/admin/requests')}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
          gap: 2,
          mb: 3
        }}
      >
        <Card className="white-card" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '18px' }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 1.5, fontSize: '0.92rem' }}>Quick actions</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
            {quickActions.map((action) => (
              <Box
                key={action.path}
                onClick={() => navigate(action.path)}
                sx={{
                  p: 1.5,
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0',
                  bgcolor: '#F8FAFC',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': { bgcolor: '#FFFFFF', borderColor: '#CBD5E1', transform: 'translateY(-2px)' }
                }}
              >
                <Box sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: `${action.color}14`, color: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                  {action.icon}
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', color: '#0F172A' }}>{action.label}</Typography>
              </Box>
            ))}
          </Box>
        </Card>

        <Card className="white-card" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '18px', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ width: 110, height: 110, flexShrink: 0 }}>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={32} outerRadius={50} paddingAngle={3} stroke="none">
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ width: '100%', height: '100%', borderRadius: '50%', border: '8px solid #E2E8F0' }} />
            )}
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Fulfillment mix</Typography>
            <Typography sx={{ color: '#64748B', fontSize: '0.8rem', mb: 1.25 }}>
              {totalRequests ? `${fillRate}% of requisitions are completed` : 'Awaiting the first branch request'}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
              {[
                { label: 'Completed', color: '#10B981', value: completedRequests },
                { label: 'Pending', color: '#F59E0B', value: pendingRequests }
              ].map((row) => (
                <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.color }} />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                    {row.label} · {row.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Card>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.35fr 1fr' },
          gap: 2,
          mb: 3
        }}
      >
        <Card className="white-card" sx={{ borderRadius: '18px', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2.5, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>High demand medicines</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>Most requested items across branches</Typography>
            </Box>
            <Button size="small" endIcon={<ArrowRight size={15} />} onClick={() => navigate('/admin/demand')} sx={{ fontWeight: 800, color: '#0D9488' }}>
              Demand report
            </Button>
          </Box>
          <Box sx={{ px: 1, pb: 2, flex: 1, height: 300 }}>
            {loading && !metrics ? (
              <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={28} /></Box>
            ) : topMedicines.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topMedicines} margin={{ top: 10, right: 16, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="_id" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <Tooltip content={<ChartTooltip valueLabel="Requests" />} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={46}>
                    {topMedicines.map((entry, index) => (
                      <Cell key={`${entry._id}-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel icon={<TrendingUp size={22} />} title="No demand yet" text="Charts fill in as mini stores submit medicine requisitions." />
            )}
          </Box>
        </Card>

        <Card className="white-card" sx={{ borderRadius: '18px', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2.5, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Branch volume</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>Requisitions by mini store</Typography>
            </Box>
            <Button size="small" endIcon={<ArrowRight size={15} />} onClick={() => navigate('/admin/stores')} sx={{ fontWeight: 800, color: '#0D9488' }}>
              Branches
            </Button>
          </Box>
          <Box sx={{ px: 1, pb: 2, flex: 1 }}>
            {loading && !metrics ? (
              <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={28} /></Box>
            ) : storeRequests.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={storeRequests} margin={{ top: 10, right: 16, left: -12, bottom: 28 }}>
                  <defs>
                    <linearGradient id="colorStoreLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="storeName" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} interval={0} angle={-18} textAnchor="end" height={50} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <Tooltip content={<ChartTooltip valueLabel="Requests" />} />
                  <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorStoreLight)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel icon={<Users size={22} />} title="No branch volume" text="Add a mini store, then requests from that branch will show here." />
            )}
          </Box>
        </Card>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.7fr) minmax(0, 1fr)' },
          gap: 2
        }}
      >
        <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
          <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Latest requisitions</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>Click a row to open request details</Typography>
            </Box>
            <Button variant="text" endIcon={<ArrowRight size={15} />} onClick={() => navigate('/admin/requests')} sx={{ fontWeight: 800, color: '#0D9488' }}>
              All requests
            </Button>
          </Box>

          <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
            {loading ? (
              <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={26} /></Box>
            ) : recentRequests.length === 0 ? (
              <EmptyPanel icon={<Activity size={22} />} title="No requisitions yet" text="When a mini store submits a request, it will appear here instantly." />
            ) : recentRequests.map((req) => (
              <Box
                key={req._id}
                onClick={() => { setSelectedReqForDetails(req); setDetailsModalOpen(true); }}
                sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC', cursor: 'pointer' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                  <Typography sx={{ fontWeight: 800, color: '#0F766E', fontSize: '0.82rem' }}>{req.requestId}</Typography>
                  <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                </Box>
                <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>{req.productName || req.medicineName}</Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mt: 0.4 }}>
                  {req.storeId?.storeName || 'Branch'} · Qty {req.quantity} · {req.customer?.name || 'Customer'}
                </Typography>
              </Box>
            ))}
          </Box>

          <TableContainer sx={{ display: { xs: 'none', md: 'block' }, width: '100%', overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Request</TableCell>
                  <TableCell>Branch</TableCell>
                  <TableCell>Medicine</TableCell>
                  <TableCell align="center">Qty</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}><CircularProgress size={28} /></TableCell></TableRow>
                ) : recentRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 1 }}>
                      <EmptyPanel icon={<Activity size={22} />} title="No requisitions yet" text="When a mini store submits a request, it will appear here instantly." />
                    </TableCell>
                  </TableRow>
                ) : recentRequests.map((req) => (
                  <TableRow
                    key={req._id}
                    hover
                    onClick={() => { setSelectedReqForDetails(req); setDetailsModalOpen(true); }}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontWeight: 800, color: '#0F766E' }}>{req.requestId}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{req.storeId?.storeName || 'Branch'}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{req.productName || req.medicineName}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: '#0D9488' }}>{req.quantity}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{req.customer?.name}</Typography>
                      <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>{req.customer?.phone}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={req.status} size="small" className={statusChipClass(req.status)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        <Card className="white-card" sx={{ borderRadius: '18px', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <AlertTriangle size={20} color="#D97706" />
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Low stock watch</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>Below warehouse reorder level</Typography>
            </Box>
          </Box>

          <Box sx={{ px: 2.5, pb: 2.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
            {lowStockItems.length === 0 ? (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', py: 3 }}>
                <Box sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.25 }}>
                  <CheckCircle2 size={22} />
                </Box>
                <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Stock looks healthy</Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.8rem', mt: 0.5, maxWidth: 220 }}>
                  Nothing is below the reorder threshold right now.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2 }}>
                {lowStockItems.map((item) => {
                  const percent = Math.min(100, Math.round((item.quantity / (item.minReorderLevel || 50)) * 100));
                  return (
                    <Box key={item._id} sx={{ p: 1.75, borderRadius: '14px', bgcolor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>{item.medicineId?.name}</Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#D97706' }}>{item.quantity} left</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={percent}
                        sx={{
                          height: 7,
                          borderRadius: 4,
                          bgcolor: '#FDE68A',
                          '& .MuiLinearProgress-bar': { bgcolor: percent < 30 ? '#EF4444' : '#F59E0B' }
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}

            <Button
              fullWidth
              variant="contained"
              startIcon={<Package size={18} />}
              onClick={() => navigate('/admin/inventory')}
              sx={{ mt: 'auto', py: 1.25, borderRadius: '12px', fontWeight: 800 }}
            >
              Manage warehouse
            </Button>
          </Box>
        </Card>
      </Box>

      <RequestDetailsModal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        request={selectedReqForDetails}
        onUpdateStatus={() => navigate('/admin/requests')}
        userRole="ADMIN"
      />
    </Box>
  );
};

export default AdminDashboard;
