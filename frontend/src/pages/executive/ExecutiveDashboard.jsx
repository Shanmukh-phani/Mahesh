import React, { useContext, useEffect, useState } from 'react';
import { Box, Card, Typography, Button, Chip, CircularProgress } from '@mui/material';
import { LayoutDashboard, ShieldCheck, Store as StoreIcon, CheckCircle2, XCircle, ArrowRight, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isAfter, subDays } from 'date-fns';
import api from '../../services/api';
import socket from '../../services/socket';
import { AuthContext } from '../../context/AuthContext';
import { PageHeader, StatCard, EmptyState } from '../../components/admin/AdminChrome';
import NotificationContext from '../../components/NotificationContext';

const ExecutiveDashboard = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [rRes, sRes] = await Promise.all([api.get('/requests'), api.get('/stores')]);
      setRequests(rRes.data || []);
      setStores(sRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('medicine_request_created', fetchData);
    socket.on('medicine_request_updated', fetchData);
    window.addEventListener('medconnect:executive-reviewed', fetchData);
    return () => {
      socket.off('medicine_request_created', fetchData);
      socket.off('medicine_request_updated', fetchData);
      window.removeEventListener('medconnect:executive-reviewed', fetchData);
    };
  }, []);

  const pending = requests.filter((r) => r.approvalStage === 'PENDING_EXECUTIVE');
  const weekAgo = subDays(new Date(), 7);
  const reviewedThisWeek = requests.filter((r) => r.executiveReview?.at && isAfter(new Date(r.executiveReview.at), weekAgo));
  const approvedWeek = reviewedThisWeek.filter((r) => r.executiveReview.decision === 'Approved').length;
  const rejectedWeek = reviewedThisWeek.filter((r) => r.executiveReview.decision === 'Rejected').length;
  const storeId = (r) => String(r.storeId?._id || r.storeId);

  if (loading) {
    return <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<LayoutDashboard size={26} />}
        title={`Hello, ${user?.name?.split(' ')[0] || 'Officer'}`}
        subtitle="Approve requests from your stores and keep an eye on their staff."
        actions={(
          <Button variant="contained" startIcon={<ShieldCheck size={16} />} onClick={() => navigate('/executive/approvals')} sx={{ borderRadius: '12px', fontWeight: 800 }}>
            Open approvals
          </Button>
        )}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.5, md: 2 }, mb: 3 }}>
        <StatCard title="Waiting for me" value={pending.length} hint="Need your approval" accent="#F59E0B" icon={<ShieldCheck size={20} />} />
        <StatCard title="My stores" value={stores.length} hint={`${stores.reduce((a, s) => a + (s.totalEmployees || 0), 0)} staff`} icon={<StoreIcon size={20} />} />
        <StatCard title="Approved" value={approvedWeek} hint="Last 7 days" accent="#16A34A" icon={<CheckCircle2 size={20} />} />
        <StatCard title="Rejected" value={rejectedWeek} hint="Last 7 days" accent="#DC2626" icon={<XCircle size={20} />} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, gap: 2.5 }}>
        <Card className="white-card" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: '18px', minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Waiting for approval</Typography>
            {pending.length > 0 && (
              <Button size="small" endIcon={<ArrowRight size={14} />} onClick={() => navigate('/executive/approvals')} sx={{ fontWeight: 800 }}>Review all</Button>
            )}
          </Box>
          {pending.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={22} />} title="All caught up" text="New requests from your stores appear here instantly." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pending.slice(0, 6).map((r) => (
                <Box
                  key={r._id}
                  onClick={() => navigate(`/executive/approvals?open=${r._id}`)}
                  sx={{ p: 1.5, borderRadius: '12px', border: '1px solid #FDE68A', bgcolor: '#FFFBEB', cursor: 'pointer', '&:hover': { borderColor: '#F59E0B' } }}
                >
                  <NotificationContext notif={{ requestCode: r.requestId, storeCode: r.storeCode || r.storeId?.storeCode, storeName: r.storeId?.storeName }} sx={{ mt: 0 }} />
                  <Typography sx={{ fontWeight: 800, mt: 0.5, overflowWrap: 'anywhere' }}>{r.productName || r.medicineName} · Qty {r.quantity}</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: '0.76rem' }}>
                    by {r.employeeName || 'Store Staff'} · {r.createdAt ? format(new Date(r.createdAt), 'dd MMM, p') : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Card>

        <Card className="white-card" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: '18px', minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>My stores</Typography>
            <Button size="small" endIcon={<ArrowRight size={14} />} onClick={() => navigate('/executive/stores')} sx={{ fontWeight: 800 }}>Manage</Button>
          </Box>
          {stores.length === 0 ? (
            <EmptyState icon={<StoreIcon size={22} />} title="No stores assigned" text="Ask the main branch to assign stores to you." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {stores.map((s) => {
                const waiting = pending.filter((r) => storeId(r) === String(s._id)).length;
                const total = requests.filter((r) => storeId(r) === String(s._id)).length;
                return (
                  <Box key={s._id} sx={{ p: 1.5, borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip label={s.storeCode} size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }} />
                        <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{s.storeName}</Typography>
                      </Box>
                      <Typography sx={{ color: '#64748B', fontSize: '0.74rem', mt: 0.4, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Users size={12} /> {s.totalEmployees || 0} staff · {total} requests
                      </Typography>
                    </Box>
                    {waiting > 0 && <Chip size="small" label={`${waiting} waiting`} sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 800, flexShrink: 0 }} />}
                  </Box>
                );
              })}
            </Box>
          )}
        </Card>
      </Box>
    </Box>
  );
};

export default ExecutiveDashboard;
