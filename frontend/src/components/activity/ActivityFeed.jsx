import React, { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress, Tooltip } from '@mui/material';
import { Download, ChevronDown, Activity, Bot } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { downloadExcel } from '../../utils/exportExcel';
import FilterBar from '../FilterBar';
import { EmptyState } from '../admin/AdminChrome';
import ActivityDetailsDialog from './ActivityDetailsDialog';
import { CategoryIcon, RoleChip, Pill2, MetaLine } from './ActivityBits';
import { CATEGORIES, FEED_GROUPS, PERIODS, periodRange, fmtShort, ago, fieldLabel, fmtValue, logExcelRow } from './activityUtils';

const PAGE_SIZE = 50;

const ActivityFeed = ({ period, onPeriodChange, users, stores, roleOptions, userId, onUserChange, refreshKey }) => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('ALL');
  const [role, setRole] = useState('');
  const [storeId, setStoreId] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback((extra = {}) => {
    const g = FEED_GROUPS.find((x) => x.value === group) || {};
    return {
      ...periodRange(period),
      ...(q ? { q } : {}),
      ...(role ? { role } : {}),
      ...(userId ? { userId } : {}),
      ...(storeId ? { storeId } : {}),
      ...(category ? { category } : g.category ? { category: g.category } : {}),
      ...(g.outcome ? { outcome: g.outcome } : {}),
      ...extra
    };
  }, [period, q, role, userId, storeId, category, group]);

  const load = useCallback(async (nextPage = 1) => {
    if (nextPage === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await api.get('/activity', { params: buildParams({ page: nextPage, limit: PAGE_SIZE }) });
      setItems((prev) => (nextPage === 1 ? res.data.items : [...prev, ...res.data.items]));
      setTotal(res.data.total);
      setHasMore(res.data.hasMore);
      setPage(nextPage);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load activity');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildParams]);

  useEffect(() => { load(1); }, [load, refreshKey]);

  const handleDownload = async () => {
    setExporting(true);
    try {
      const res = await api.get('/activity', { params: buildParams({ page: 1, limit: 5000 }) });
      if (!res.data.items.length) {
        toast.error('No activity to download');
        return;
      }
      await downloadExcel(res.data.items.map(logExcelRow), { fileName: 'activity-log', sheetName: 'Activity' });
      if (res.data.total > res.data.items.length) toast(`Downloaded the latest ${res.data.items.length} of ${res.data.total} rows`);
    } catch (err) {
      toast.error('Download failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search what happened, person, store, IP..."
          quickFilters={FEED_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
          quickValue={group}
          onQuickChange={(v) => { setGroup(v); setCategory(''); }}
          filters={[
            { key: 'period', label: 'Period', value: period, defaultValue: 'today', options: PERIODS, onChange: onPeriodChange },
            { key: 'role', label: 'Role', value: role, options: [{ value: '', label: 'Everyone' }, ...roleOptions], onChange: setRole },
            { key: 'user', label: 'Person', value: userId, options: [{ value: '', label: 'All people' }, ...users.map((u) => ({ value: u._id, label: `${u.name}${u.storeCode ? ` · ${u.storeCode}` : ''}` }))], onChange: onUserChange },
            { key: 'store', label: 'Store', value: storeId, options: [{ value: '', label: 'All stores' }, ...stores.map((s) => ({ value: s._id, label: `${s.storeCode} · ${s.storeName}` }))], onChange: setStoreId },
            { key: 'category', label: 'Type', value: category, options: [{ value: '', label: 'All types' }, ...Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.label }))], onChange: (v) => { setCategory(v); setGroup('ALL'); } }
          ]}
          resultCount={total}
          resultLabel="events"
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
          <Button size="small" variant="outlined" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={15} />} disabled={exporting} onClick={handleDownload} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            Download Excel
          </Button>
        </Box>
      </Box>

      <Box sx={{ p: { xs: 1, md: 1.5 } }}>
        {loading ? (
          <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={30} /></Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 1 }}><EmptyState icon={<Activity size={22} />} title="No activity found" text="Try a longer period or clear some filters." /></Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {items.map((l) => {
              const failed = l.outcome === 'FAILED';
              return (
                <Box
                  key={l._id}
                  component="button"
                  type="button"
                  onClick={() => setSelected(l)}
                  sx={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                    p: { xs: 1.25, md: 1.5 },
                    borderRadius: '14px',
                    border: '1px solid',
                    borderColor: failed ? '#FECACA' : 'transparent',
                    bgcolor: failed ? '#FEF2F2' : 'transparent',
                    '&:hover': { bgcolor: failed ? '#FEE2E2' : '#F8FAFC', borderColor: failed ? '#FCA5A5' : '#E2E8F0' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' }
                  }}
                >
                  <CategoryIcon category={l.category} failed={failed} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                      <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.87rem', lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {l.summary || l.action}
                      </Typography>
                      <Tooltip title={fmtShort(l.at)}>
                        <Typography component="span" sx={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
                          {ago(l.at)}
                        </Typography>
                      </Tooltip>
                    </Box>
                    <MetaLine>
                      <Box component="span" sx={{ fontWeight: 800, color: '#334155' }}>{l.actorName || l.actorUsername || 'Unknown'}</Box>
                      <RoleChip role={l.actorRole} adminLevel={l.adminLevel} designation={l.designation} />
                      {l.storeCode && <Pill2 label={l.storeCode} bg="#F1F5F9" color="#334155" />}
                      {l.source === 'AI_ASSISTANT' && <Pill2 label={<><Bot size={11} style={{ marginRight: 3 }} />Ask AI</>} bg="#EEF2FF" color="#4338CA" />}
                      {failed && <Pill2 label="Failed" bg="#FEE2E2" color="#B91C1C" />}
                      <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{fmtShort(l.at)}</Box>
                      <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{fmtShort(l.at)}{l.device ? ` · ${l.device}` : ''}{l.ip ? ` · ${l.ip}` : ''}</Box>
                    </MetaLine>
                    {l.changes?.length > 0 && (
                      <Typography sx={{ mt: 0.6, color: '#475569', fontSize: '0.75rem', fontWeight: 600, wordBreak: 'break-word' }}>
                        {l.changes.slice(0, 3).map((c) => `${fieldLabel(c.field)}: ${fmtValue(c.from)} → ${fmtValue(c.to)}`).join(' · ')}
                        {l.changes.length > 3 ? ` · +${l.changes.length - 3} more` : ''}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {!loading && items.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: '1px solid #F1F5F9' }}>
          <Typography sx={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 700 }}>Showing {items.length} of {total} events</Typography>
          {hasMore && (
            <Button size="small" variant="outlined" disabled={loadingMore} onClick={() => load(page + 1)} endIcon={loadingMore ? <CircularProgress size={12} /> : <ChevronDown size={14} />} sx={{ borderRadius: '10px', fontWeight: 800 }}>
              Load more
            </Button>
          )}
        </Box>
      )}

      <ActivityDetailsDialog log={selected} onClose={() => setSelected(null)} />
    </>
  );
};

export default ActivityFeed;
