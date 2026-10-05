import React, { useEffect, useState } from 'react';
import { Box, Card, Typography, Button, Chip, CircularProgress } from '@mui/material';
import { Store as StoreIcon, MapPin, Users, Eye, RefreshCw, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import StoreDetailsModal from '../../components/StoreDetailsModal';
import { PageHeader, EmptyState } from '../../components/admin/AdminChrome';

const ExecutiveStoresPage = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const fetchStores = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stores');
      setStores(res.data || []);
    } catch (err) {
      toast.error('Failed to load your stores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const isActive = (s) => (s.status ? s.status === 'Active' : s.isActive !== false);

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<StoreIcon size={26} />}
        title="My stores & staff"
        subtitle="Add employees, create their personal logins, and switch access on or off. Stores are added by the main branch."
        actions={(
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={fetchStores} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>Refresh</Button>
        )}
      />

      {loading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
      ) : stores.length === 0 ? (
        <Card className="white-card" sx={{ borderRadius: '18px' }}>
          <EmptyState icon={<StoreIcon size={22} />} title="No stores assigned yet" text="The main branch assigns stores to executive officers." />
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
          {stores.map((s) => (
            <Card key={s._id} className="white-card white-card-hover" sx={{ p: { xs: 2, md: 2.25 }, borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Chip label={s.storeCode} size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 800 }} />
                <Chip label={isActive(s) ? 'Active' : 'Inactive'} size="small" sx={{ bgcolor: isActive(s) ? '#DCFCE7' : '#FEE2E2', color: isActive(s) ? '#166534' : '#991B1B', fontWeight: 800 }} />
              </Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem', overflowWrap: 'anywhere' }}>{s.storeName}</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.8rem', display: 'flex', alignItems: 'flex-start', gap: 0.5, overflowWrap: 'anywhere' }}>
                <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {s.location || 'No address'}
              </Typography>
              {(s.contactPerson || s.managerPhone) && (
                <Typography sx={{ color: '#64748B', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Phone size={13} /> {s.contactPerson || 'Manager'}{s.managerPhone ? ` · ${s.managerPhone}` : ''}
                </Typography>
              )}
              <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Users size={14} /> {s.totalEmployees || 0} staff
              </Typography>
              <Button variant="contained" startIcon={<Eye size={15} />} onClick={() => setSelectedId(s._id)} sx={{ mt: 'auto', fontWeight: 800, borderRadius: '10px', alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
                Staff & logins
              </Button>
            </Card>
          ))}
        </Box>
      )}

      <StoreDetailsModal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} storeId={selectedId} onStoreUpdated={fetchStores} />
    </Box>
  );
};

export default ExecutiveStoresPage;
