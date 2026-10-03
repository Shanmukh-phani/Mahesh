import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, Button, CircularProgress
} from '@mui/material';
import { BarChart3, TrendingUp, CheckCircle2, Flame, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api from '../../services/api';
import { PageHeader, StatCard, EmptyState, searchSlotProps } from '../../components/admin/AdminChrome';

const MedicineDemand = () => {
  const [data, setData] = useState({ medicineDemand: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchDemand = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests/demand-analytics');
      if (res.data && res.data.medicineDemand) {
        setData(res.data);
      } else {
        setData({ medicineDemand: [], summary: { totalDemandItems: 0, highDemandCount: 0, moderateDemandCount: 0, lowDemandCount: 0 } });
      }
    } catch (err) {
      console.error('API error fetching demand analytics:', err);
      setData({ medicineDemand: [], summary: { totalDemandItems: 0, highDemandCount: 0, moderateDemandCount: 0, lowDemandCount: 0 } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDemand();
  }, []);

  const medicineList = data?.medicineDemand || [];
  const filteredMedicines = medicineList.filter((item) => (item._id || '').toLowerCase().includes(search.toLowerCase()));
  const chartData = filteredMedicines.slice(0, 7).map((item) => ({
    name: item._id,
    TotalQty: item.totalQuantity || 0,
    Requests: item.totalRequests || 0
  }));
  const summary = data?.summary || {};

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<BarChart3 size={26} />}
        title="Medicine demand"
        subtitle="Quantities requested by mini stores, grouped by product and demand velocity."
        actions={
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchDemand} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
            Refresh
          </Button>
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>
        <StatCard title="Products requested" value={summary.totalDemandItems || 0} hint="Unique medicine items" accent="#0D9488" icon={<BarChart3 size={18} />} />
        <StatCard title="High demand" value={summary.highDemandCount || 0} hint="5+ units requested" accent="#DC2626" icon={<Flame size={18} />} />
        <StatCard title="Moderate" value={summary.moderateDemandCount || 0} hint="2 to 4 units" accent="#2563EB" icon={<TrendingUp size={18} />} />
        <StatCard title="Low / single" value={summary.lowDemandCount || 0} hint="1 unit requested" accent="#64748B" icon={<CheckCircle2 size={18} />} />
      </Box>

      <Card className="white-card" sx={{ p: { xs: 2, md: 2.75 }, mb: 3, borderRadius: '18px' }}>
        <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.4 }}>Top requested medicines</Typography>
        <Typography sx={{ color: '#64748B', fontSize: '0.78rem', mb: 2 }}>Quantity demanded vs number of requisitions</Typography>
        {chartData.length > 0 ? (
          <Box sx={{ width: '100%', height: { xs: 260, md: 320 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 12, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#64748B" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="TotalQty" name="Total quantity" fill="#0D9488" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Requests" name="Requisitions" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <EmptyState icon={<BarChart3 size={22} />} title="No demand data yet" text="The chart fills in after mini stores submit medicine requisitions." />
        )}
      </Card>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Demand by product</Typography>
          <TextField size="small" placeholder="Filter medicine..." value={search} onChange={(e) => setSearch(e.target.value)} slotProps={searchSlotProps} sx={{ width: { xs: '100%', sm: 280 } }} />
        </Box>

        <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25, px: 2, pb: 2.5 }}>
          {loading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
          ) : filteredMedicines.length === 0 ? (
            <EmptyState icon={<BarChart3 size={22} />} title="No demand recorded" text="Analytics populate as mini stores submit requisitions." />
          ) : filteredMedicines.map((item, index) => {
            const qty = item.totalQuantity || 0;
            const level = qty >= 5 ? 'HIGH' : qty >= 2 ? 'MODERATE' : 'LOW';
            return (
              <Box key={item._id || index} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                  <Typography sx={{ fontWeight: 800 }}>{item._id}</Typography>
                  <Chip label={`${level} DEMAND`} size="small" sx={{ fontWeight: 800, bgcolor: level === 'HIGH' ? '#FEE2E2' : level === 'MODERATE' ? '#DBEAFE' : '#F1F5F9', color: level === 'HIGH' ? '#991B1B' : level === 'MODERATE' ? '#1E40AF' : '#475569' }} />
                </Box>
                <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>
                  {item.totalRequests || 0} requests · {qty} units · {item.pendingCount || 0} pending
                </Typography>
              </Box>
            );
          })}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell align="center">Requisitions</TableCell>
                <TableCell align="center">Quantity</TableCell>
                <TableCell align="center">Pending</TableCell>
                <TableCell align="center">Completed</TableCell>
                <TableCell align="center">Level</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}><CircularProgress size={30} /></TableCell></TableRow>
              ) : filteredMedicines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState icon={<BarChart3 size={22} />} title="No demand recorded" text="Analytics populate as mini stores submit requisitions." />
                  </TableCell>
                </TableRow>
              ) : filteredMedicines.map((item, index) => {
                const qty = item.totalQuantity || 0;
                const isHigh = qty >= 5;
                const isMod = qty >= 2 && qty < 5;
                return (
                  <TableRow key={item._id || index} hover>
                    <TableCell sx={{ fontWeight: 800 }}>{item._id}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>{item.totalRequests || 0}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: '#0D9488' }}>{qty} units</TableCell>
                    <TableCell align="center">
                      <Chip label={`${item.pendingCount || 0} pending`} size="small" sx={{ bgcolor: (item.pendingCount || 0) > 0 ? '#FEF3C7' : '#F1F5F9', color: (item.pendingCount || 0) > 0 ? '#92400E' : '#475569', fontWeight: 800 }} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={`${item.completedCount || 0} done`} size="small" sx={{ bgcolor: '#DCFCE7', color: '#166534', fontWeight: 800 }} />
                    </TableCell>
                    <TableCell align="center">
                      {isHigh ? (
                        <Chip label="HIGH" size="small" sx={{ bgcolor: '#FEE2E2', color: '#991B1B', fontWeight: 800 }} />
                      ) : isMod ? (
                        <Chip label="MODERATE" size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }} />
                      ) : (
                        <Chip label="LOW" size="small" sx={{ bgcolor: '#F1F5F9', color: '#475569', fontWeight: 800 }} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

export default MedicineDemand;
