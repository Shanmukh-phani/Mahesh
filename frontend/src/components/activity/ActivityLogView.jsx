import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Box, Card, Tabs, Tab, Button } from '@mui/material';
import { History, RefreshCw, LayoutDashboard, ListTree, Timer } from 'lucide-react';
import api from '../../services/api';
import { AuthContext } from '../../context/AuthContext';
import { PageHeader } from '../admin/AdminChrome';
import ActivityOverview from './ActivityOverview';
import ActivityFeed from './ActivityFeed';
import SessionsList from './SessionsList';

const currentSessionId = () => {
  try {
    const token = localStorage.getItem('token') || '';
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sid || null;
  } catch {
    return null;
  }
};

const ActivityLogView = () => {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'ADMIN';
  const isMain = isAdmin && user?.adminLevel !== 'SUB';

  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('today');
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const currentSid = useMemo(currentSessionId, []);

  useEffect(() => {
    api.get('/activity/users').then((r) => setUsers(r.data || [])).catch(() => {});
    api.get('/stores').then((r) => setStores(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const roleOptions = isAdmin
    ? [
      { value: 'ADMIN', label: 'Admins' },
      { value: 'EXECUTIVE', label: 'Executive officers' },
      { value: 'MINI_STORE', label: 'Store staff' },
      { value: 'SYSTEM', label: 'Server' },
      { value: 'GUEST', label: 'Unknown sign-in attempts' }
    ]
    : [
      { value: 'MINI_STORE', label: 'Store staff' },
      { value: 'EXECUTIVE', label: 'Me' }
    ];

  const canEnd = (s) => {
    if (isMain) return true;
    if (isAdmin) return s.role !== 'ADMIN';
    return s.role === 'MINI_STORE';
  };

  const openUser = (id) => {
    setUserId(String(id));
    setTab('activity');
  };

  const shared = { period, onPeriodChange: setPeriod, users, stores, roleOptions, userId, onUserChange: setUserId, refreshKey };

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<History size={26} />}
        title="Activity logs"
        subtitle={isAdmin
          ? 'Everything that happens in the app: who signed in, how long they stayed, what they opened and every change they made.'
          : 'Sign-ins, time in app and every change made by the staff of your stores, plus your own activity.'}
        actions={(
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => setRefreshKey((k) => k + 1)} sx={{ borderRadius: '12px', fontWeight: 800, color: '#475569', borderColor: '#CBD5E1' }}>
            Refresh
          </Button>
        )}
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 800, fontSize: '0.88rem' } }}
      >
        <Tab value="overview" icon={<LayoutDashboard size={16} />} iconPosition="start" label="Overview" />
        <Tab value="activity" icon={<ListTree size={16} />} iconPosition="start" label="Activity log" />
        <Tab value="sessions" icon={<Timer size={16} />} iconPosition="start" label="Sign-in sessions" />
      </Tabs>

      {tab === 'overview' && <ActivityOverview period={period} onPeriodChange={setPeriod} onOpenUser={openUser} refreshKey={refreshKey} />}
      {tab === 'activity' && (
        <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
          <ActivityFeed {...shared} />
        </Card>
      )}
      {tab === 'sessions' && (
        <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
          <SessionsList {...shared} canEnd={canEnd} currentSid={currentSid} />
        </Card>
      )}
    </Box>
  );
};

export default ActivityLogView;
