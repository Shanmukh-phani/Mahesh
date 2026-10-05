import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Card, Typography, Button, CircularProgress, Table, TableHead, TableRow, TableCell, TableBody, TextField, MenuItem
} from '@mui/material';
import { Users, LogIn, PencilLine, Clock, Server, Download, Wifi, MousePointerClick } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { pageTitle } from '../../services/activity';
import { downloadExcel } from '../../utils/exportExcel';
import { StatCard, EmptyState } from '../admin/AdminChrome';
import { RoleChip, Pill2, MetaLine, SessionStatusChip } from './ActivityBits';
import { PERIODS, periodRange, fmtDuration, fmtShort, fmtTime, ago, categoryInfo, userTimeExcelRow } from './activityUtils';

const SectionTitle = ({ icon, title, hint, action }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: { xs: 2, md: 2.5 }, py: 1.75, borderBottom: '1px solid #F1F5F9' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem' }}>{title}</Typography>
        {hint && <Typography sx={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600 }}>{hint}</Typography>}
      </Box>
    </Box>
    {action}
  </Box>
);

const ActivityOverview = ({ period, onPeriodChange, onOpenUser, refreshKey }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await api.get('/activity/summary', { params: periodRange(period) });
      setData(res.data);
    } catch (err) {
      if (!quiet) toast.error(err.response?.data?.error || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={30} /></Box>;
  if (!data) return null;

  const { totals, online, users, categories, system } = data;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label || '';
  const catEntries = Object.entries(categories || {}).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...catEntries.map(([, n]) => n));

  const downloadUsers = async () => {
    if (!users.length) {
      toast.error('Nothing to download');
      return;
    }
    await downloadExcel(users.map(userTimeExcelRow), { fileName: `time-in-app-${period}`, sheetName: 'Time in app' });
  };

  return (
    <Box sx={{ display: 'grid', gap: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography sx={{ color: '#64748B', fontSize: '0.82rem', fontWeight: 700 }}>
          Showing <b>{periodLabel.toLowerCase()}</b>. Updates every 30 seconds.
        </Typography>
        <TextField select size="small" label="Period" value={period} onChange={(e) => onPeriodChange(e.target.value)} sx={{ minWidth: 170, '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#FFFFFF' } }}>
          {PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </TextField>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }, gap: { xs: 1.5, md: 2 } }}>
        <StatCard title="Online now" value={totals.onlineNow} hint="App open in the last 3 min" icon={<Wifi size={20} />} accent="#16A34A" />
        <StatCard title="Sign-ins" value={totals.logins} hint={totals.failedLogins ? `${totals.failedLogins} failed / blocked` : 'No failed attempts'} icon={<LogIn size={20} />} accent={totals.failedLogins ? '#DC2626' : '#2563EB'} />
        <StatCard title="Changes made" value={totals.changes} hint={`${totals.activeUsers} people used the app`} icon={<PencilLine size={20} />} />
        <StatCard title="Time in app" value={fmtDuration(totals.totalMs)} hint={`Active on screen ${fmtDuration(totals.activeMs)}`} icon={<Clock size={20} />} accent="#7C3AED" />
        <StatCard title="Pages opened" value={totals.pageViews} hint={`${totals.exports} Excel downloads`} icon={<MousePointerClick size={20} />} accent="#D97706" />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: system ? '1.4fr 1fr' : '1fr' }, gap: { xs: 2, md: 2.5 } }}>
        <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
          <SectionTitle icon={<Wifi size={18} />} title={`Online now (${totals.onlineNow})`} hint={`${online.length} open session${online.length === 1 ? '' : 's'} active in the last 3 minutes`} />
          {online.length === 0 ? (
            <Box sx={{ p: 2 }}><EmptyState icon={<Users size={22} />} title="Nobody online" text="People who have the app open show here." /></Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25, p: { xs: 1.5, md: 2 } }}>
              {online.map((s) => (
                <Box key={s._id} component="button" type="button" onClick={() => onOpenUser(s.userId)} sx={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', p: 1.5, borderRadius: '14px', border: '1px solid #DCFCE7', bgcolor: '#F0FDF4', '&:hover': { borderColor: '#86EFAC' }, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem', wordBreak: 'break-word' }}>{s.name || s.username}</Typography>
                    <SessionStatusChip status="ONLINE" />
                  </Box>
                  <MetaLine>
                    <RoleChip role={s.role} adminLevel={s.adminLevel} />
                    {s.storeCode && <Pill2 label={s.storeCode} bg="#FFFFFF" color="#334155" />}
                  </MetaLine>
                  <MetaLine>
                    <span>On {pageTitle(s.lastPath || '') || '—'}</span>
                    <span>· signed in {ago(s.loginAt)}</span>
                  </MetaLine>
                  <MetaLine><span>{s.device}{s.ip ? ` · ${s.ip}` : ''}</span></MetaLine>
                </Box>
              ))}
            </Box>
          )}
        </Card>

        {system && (
          <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
            <SectionTitle icon={<Server size={18} />} title="Server" hint="How long the app has been running" />
            <Box sx={{ p: { xs: 2, md: 2.5 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {[
                  ['Running for', fmtDuration(system.uptimeMs)],
                  ['Started', fmtShort(system.serverStartedAt)],
                  ['Database', system.dbState],
                  ['Memory', `${system.memoryMb} MB`]
                ].map(([k, v]) => (
                  <Box key={k} sx={{ p: 1.25, borderRadius: '12px', bgcolor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</Typography>
                    <Typography sx={{ color: k === 'Database' && v !== 'connected' ? '#DC2626' : '#0F172A', fontSize: '0.92rem', fontWeight: 800, textTransform: k === 'Database' ? 'capitalize' : 'none' }}>{v}</Typography>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontWeight: 800, color: '#334155', fontSize: '0.8rem', mt: 2, mb: 1 }}>Recent starts and stops</Typography>
              <Box sx={{ display: 'grid', gap: 0.75 }}>
                {(system.events || []).map((e) => (
                  <Box key={e._id} sx={{ display: 'flex', gap: 1, alignItems: 'center', fontSize: '0.78rem' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: e.action === 'SERVER_START' ? '#22C55E' : '#EF4444', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', flex: 1, minWidth: 0 }}>{e.summary}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtShort(e.at)}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Card>
        )}
      </Box>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <SectionTitle
          icon={<Clock size={18} />}
          title="Time in app per person"
          hint="Tap a person to see everything they did"
          action={<Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={downloadUsers} sx={{ borderRadius: '10px', fontWeight: 800 }}>Download Excel</Button>}
        />
        {users.length === 0 ? (
          <Box sx={{ p: 2 }}><EmptyState icon={<Users size={22} />} title="No one used the app in this period" text="Pick a longer period." /></Box>
        ) : (
          <>
            <Box sx={{ display: { xs: 'grid', lg: 'none' }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25, p: { xs: 1.5, md: 2 } }}>
              {users.map((u) => (
                <Box key={u.userId} component="button" type="button" onClick={() => onOpenUser(u.userId)} sx={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', p: 1.5, borderRadius: '14px', border: '1px solid #E2E8F0', '&:hover': { borderColor: 'primary.main' }, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem', wordBreak: 'break-word' }}>{u.name || u.username}</Typography>
                    {u.online && <SessionStatusChip status="ONLINE" />}
                  </Box>
                  <MetaLine>
                    <RoleChip role={u.role} adminLevel={u.adminLevel} />
                    {u.storeCode && <Pill2 label={u.storeCode} bg="#F1F5F9" color="#334155" />}
                  </MetaLine>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 1.25 }}>
                    {[['In app', fmtDuration(u.totalMs)], ['Active', fmtDuration(u.activeMs)], ['Sessions', u.sessions], ['Changes', u.actions || 0], ['Pages', u.pageViews || 0], ['Last seen', ago(u.lastSeenAt)]].map(([k, v]) => (
                      <Box key={k} sx={{ minWidth: 0 }}>
                        <Typography sx={{ color: '#94A3B8', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase' }}>{k}</Typography>
                        <Typography sx={{ color: '#0F172A', fontSize: '0.8rem', fontWeight: 800, wordBreak: 'break-word' }}>{v}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: { xs: 'none', lg: 'block' }, overflowX: 'auto' }}>
              <Table size="small" sx={{ '& th': { fontWeight: 800, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }, '& td': { fontSize: '0.82rem' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Person</TableCell>
                    <TableCell>Store</TableCell>
                    <TableCell align="right">Sessions</TableCell>
                    <TableCell align="right">Time in app</TableCell>
                    <TableCell align="right">Active</TableCell>
                    <TableCell align="right">Changes</TableCell>
                    <TableCell align="right">Pages</TableCell>
                    <TableCell align="right">Failed</TableCell>
                    <TableCell>Last sign-in</TableCell>
                    <TableCell>Last seen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.userId} hover onClick={() => onOpenUser(u.userId)} sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {u.online && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22C55E' }} />}
                          <Typography sx={{ fontWeight: 800, fontSize: '0.84rem' }}>{u.name || u.username}</Typography>
                        </Box>
                        <MetaLine><span>{u.username}</span><RoleChip role={u.role} adminLevel={u.adminLevel} /></MetaLine>
                      </TableCell>
                      <TableCell>{u.storeCode || '—'}</TableCell>
                      <TableCell align="right">{u.sessions}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{fmtDuration(u.totalMs)}</TableCell>
                      <TableCell align="right">{fmtDuration(u.activeMs)}</TableCell>
                      <TableCell align="right">{u.actions || 0}</TableCell>
                      <TableCell align="right">{u.pageViews || 0}</TableCell>
                      <TableCell align="right" sx={{ color: u.failed ? '#DC2626' : 'inherit', fontWeight: u.failed ? 800 : 400 }}>{u.failed || 0}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtShort(u.lastLoginAt)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }} title={fmtTime(u.lastSeenAt)}>{ago(u.lastSeenAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </Card>

      {catEntries.length > 0 && (
        <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
          <SectionTitle icon={<PencilLine size={18} />} title="What happened" hint={`Events by type, ${periodLabel.toLowerCase()}`} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 1.25, p: { xs: 2, md: 2.5 } }}>
            {catEntries.map(([c, n]) => {
              const info = categoryInfo(c);
              return (
                <Box key={c}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>{info.label}</Typography>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>{n}</Typography>
                  </Box>
                  <Box sx={{ height: 8, borderRadius: 8, bgcolor: '#F1F5F9', overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${Math.max(3, (n / catMax) * 100)}%`, bgcolor: info.color, borderRadius: 8 }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Card>
      )}
    </Box>
  );
};

export default ActivityOverview;
