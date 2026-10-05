import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Button, CircularProgress, Table, TableHead, TableRow, TableCell, TableBody, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Download, ChevronDown, Timer, LogOut, Monitor } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { downloadExcel } from '../../utils/exportExcel';
import FilterBar from '../FilterBar';
import { EmptyState, dialogPaperSx } from '../admin/AdminChrome';
import { RoleChip, SessionStatusChip, Pill2, MetaLine } from './ActivityBits';
import { pageTitle } from '../../services/activity';
import { PERIODS, periodRange, fmtShort, fmtDuration, sessionExcelRow } from './activityUtils';

const pageTitleFor = (path) => (path ? pageTitle(path) : '—');

const PAGE_SIZE = 50;
const STATUS_FILTERS = [
  { value: '', label: 'All sessions' },
  { value: 'ONLINE', label: 'Online now' },
  { value: 'ENDED', label: 'Ended' }
];

const SessionsList = ({ period, onPeriodChange, users, stores, roleOptions, userId, onUserChange, canEnd, currentSid, refreshKey }) => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [storeId, setStoreId] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback((extra = {}) => ({
    ...(status === 'ONLINE' ? {} : periodRange(period)),
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(role ? { role } : {}),
    ...(userId ? { userId } : {}),
    ...(storeId ? { storeId } : {}),
    ...extra
  }), [period, q, status, role, userId, storeId]);

  const load = useCallback(async (nextPage = 1) => {
    if (nextPage === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await api.get('/activity/sessions', { params: buildParams({ page: nextPage, limit: PAGE_SIZE }) });
      setItems((prev) => (nextPage === 1 ? res.data.items : [...prev, ...res.data.items]));
      setTotal(res.data.total);
      setHasMore(res.data.hasMore);
      setPage(nextPage);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load sessions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildParams]);

  useEffect(() => { load(1); }, [load, refreshKey]);

  const handleDownload = async () => {
    setExporting(true);
    try {
      const res = await api.get('/activity/sessions', { params: buildParams({ page: 1, limit: 5000 }) });
      if (!res.data.items.length) {
        toast.error('No sessions to download');
        return;
      }
      await downloadExcel(res.data.items.map(sessionExcelRow), { fileName: 'login-sessions', sheetName: 'Sessions' });
    } catch (err) {
      toast.error('Download failed');
    } finally {
      setExporting(false);
    }
  };

  const endSession = async () => {
    if (!confirm) return;
    setEnding(true);
    try {
      const res = await api.put(`/activity/sessions/${confirm._id}/end`);
      setItems((prev) => prev.map((s) => (s._id === confirm._id ? { ...s, ...res.data } : s)));
      toast.success(`${confirm.name || confirm.username} has been signed out`);
      setConfirm(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not end the session');
    } finally {
      setEnding(false);
    }
  };

  const endable = (s) => canEnd(s) && !s.logoutAt && s._id !== currentSid;
  const isMine = (s) => s._id === currentSid;

  const renderEnd = (s, full) => (endable(s) ? (
    <Button size="small" color="error" variant="outlined" fullWidth={full} startIcon={<LogOut size={14} />} onClick={() => setConfirm(s)} sx={{ borderRadius: '10px', fontWeight: 800, whiteSpace: 'nowrap' }}>
      Sign out
    </Button>
  ) : null);

  return (
    <>
      <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search person, login, store, device, IP..."
          quickFilters={STATUS_FILTERS}
          quickValue={status}
          onQuickChange={setStatus}
          filters={[
            { key: 'period', label: 'Signed in', value: period, defaultValue: 'today', options: PERIODS, onChange: onPeriodChange },
            { key: 'role', label: 'Role', value: role, options: [{ value: '', label: 'Everyone' }, ...roleOptions.filter((r) => r.value !== 'SYSTEM' && r.value !== 'GUEST')], onChange: setRole },
            { key: 'user', label: 'Person', value: userId, options: [{ value: '', label: 'All people' }, ...users.map((u) => ({ value: u._id, label: `${u.name}${u.storeCode ? ` · ${u.storeCode}` : ''}` }))], onChange: onUserChange },
            { key: 'store', label: 'Store', value: storeId, options: [{ value: '', label: 'All stores' }, ...stores.map((s) => ({ value: s._id, label: `${s.storeCode} · ${s.storeName}` }))], onChange: setStoreId }
          ]}
          resultCount={total}
          resultLabel="sessions"
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
          <Typography sx={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>
            Session length = sign-in to sign-out (or last activity). Active = time the app was open on screen.
          </Typography>
          <Button size="small" variant="outlined" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={15} />} disabled={exporting} onClick={handleDownload} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            Download Excel
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={30} /></Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 2 }}><EmptyState icon={<Timer size={22} />} title="No sessions found" text="Sign-ins in this period will show here." /></Box>
      ) : (
        <>
          {/* Cards below lg */}
          <Box sx={{ display: { xs: 'grid', lg: 'none' }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, p: { xs: 1.5, md: 2 } }}>
            {items.map((s) => (
              <Box key={s._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#FFFFFF' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem', wordBreak: 'break-word' }}>
                      {s.name || s.username}{isMine(s) ? ' (you, this device)' : ''}
                    </Typography>
                    <MetaLine>
                      <span>{s.username}</span>
                      <RoleChip role={s.role} adminLevel={s.adminLevel} />
                      {s.storeCode && <Pill2 label={s.storeCode} bg="#F1F5F9" color="#334155" />}
                    </MetaLine>
                  </Box>
                  <SessionStatusChip status={s.status} />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
                  {[
                    ['Signed in', fmtShort(s.loginAt)],
                    [s.logoutAt ? 'Signed out' : 'Last seen', fmtShort(s.logoutAt || s.lastSeenAt)],
                    ['Session length', fmtDuration(s.durationMs)],
                    ['Active', fmtDuration(s.activeMs)],
                    ['Pages / changes', `${s.pageViews || 0} / ${s.actions || 0}`],
                    ['Last page', pageTitleFor(s.lastPath)]
                  ].map(([k, v]) => (
                    <Box key={k} sx={{ minWidth: 0 }}>
                      <Typography sx={{ color: '#94A3B8', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</Typography>
                      <Typography sx={{ color: '#0F172A', fontSize: '0.8rem', fontWeight: 700, wordBreak: 'break-word' }}>{v}</Typography>
                    </Box>
                  ))}
                </Box>
                <MetaLine>
                  <Monitor size={12} />
                  <span>{s.device || 'Unknown device'}{s.ip ? ` · ${s.ip}` : ''}</span>
                </MetaLine>
                {s.endedBy && <MetaLine><span>Signed out by {s.endedBy}</span></MetaLine>}
                {endable(s) && <Box sx={{ mt: 1.5 }}>{renderEnd(s, true)}</Box>}
              </Box>
            ))}
          </Box>

          {/* Table at lg+ */}
          <Box sx={{ display: { xs: 'none', lg: 'block' }, overflowX: 'auto' }}>
            <Table size="small" sx={{ '& th': { fontWeight: 800, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }, '& td': { fontSize: '0.82rem', color: '#0F172A' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Store</TableCell>
                  <TableCell>Signed in</TableCell>
                  <TableCell>Signed out / last seen</TableCell>
                  <TableCell align="right">Length</TableCell>
                  <TableCell align="right">Active</TableCell>
                  <TableCell align="right">Pages</TableCell>
                  <TableCell align="right">Changes</TableCell>
                  <TableCell>Device / IP</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s._id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.84rem' }}>{s.name || s.username}{isMine(s) ? ' (you)' : ''}</Typography>
                      <MetaLine><span>{s.username}</span><RoleChip role={s.role} adminLevel={s.adminLevel} /></MetaLine>
                    </TableCell>
                    <TableCell>{s.storeCode ? <><b>{s.storeCode}</b><br /><Box component="span" sx={{ color: '#64748B', fontSize: '0.75rem' }}>{s.storeName}</Box></> : '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtShort(s.loginAt)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtShort(s.logoutAt || s.lastSeenAt)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{fmtDuration(s.durationMs)}</TableCell>
                    <TableCell align="right">{fmtDuration(s.activeMs)}</TableCell>
                    <TableCell align="right">{s.pageViews || 0}</TableCell>
                    <TableCell align="right">{s.actions || 0}</TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography sx={{ fontSize: '0.76rem', fontWeight: 600 }}>{s.device || '—'}</Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>{s.ip}{s.lastPath ? ` · ${pageTitleFor(s.lastPath)}` : ''}</Typography>
                    </TableCell>
                    <TableCell>
                      <SessionStatusChip status={s.status} />
                      {s.endedBy && <Typography sx={{ fontSize: '0.68rem', color: '#64748B', mt: 0.4 }}>by {s.endedBy}</Typography>}
                    </TableCell>
                    <TableCell align="right">{renderEnd(s)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      )}

      {!loading && items.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: '1px solid #F1F5F9' }}>
          <Typography sx={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 700 }}>Showing {items.length} of {total} sessions</Typography>
          {hasMore && (
            <Button size="small" variant="outlined" disabled={loadingMore} onClick={() => load(page + 1)} endIcon={loadingMore ? <CircularProgress size={12} /> : <ChevronDown size={14} />} sx={{ borderRadius: '10px', fontWeight: 800 }}>
              Load more
            </Button>
          )}
        </Box>
      )}

      <Dialog open={Boolean(confirm)} onClose={() => !ending && setConfirm(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Sign out {confirm?.name || confirm?.username}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: '0.9rem' }}>
            Their app will stop working on {confirm?.device || 'that device'} and they will have to sign in again. This is recorded in the activity log.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(null)} disabled={ending} sx={{ fontWeight: 800 }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={endSession} disabled={ending} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            {ending ? 'Signing out...' : 'Sign out'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SessionsList;
