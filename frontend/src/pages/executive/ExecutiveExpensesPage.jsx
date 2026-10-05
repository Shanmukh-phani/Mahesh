import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Card, Button, CircularProgress, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import { Wallet, Download, CheckCircle2, Clock, Store as StoreIcon, BellRing, AlertTriangle, CheckCheck, HandCoins } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import api from '../../services/api';
import socket from '../../services/socket';
import { downloadExcel } from '../../utils/exportExcel';
import { currentMonth, isValidMonth, monthLabel, money, expenseExcelRow, EXPENSE_CATEGORIES, PAYMENT_MODES, PAYMENT_STATUS_META, paymentStatusOf } from '../../utils/expenses';
import FilterBar, { usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, StatCard, EmptyState, dialogPaperSx, ChoiceChips } from '../../components/admin/AdminChrome';
import { MonthPicker, CategoryBreakdown } from '../../components/expenses/ExpenseBits';
import ExpenseList from '../../components/expenses/ExpenseList';

const ExecutiveExpensesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => (isValidMonth(searchParams.get('month')) ? searchParams.get('month') : currentMonth()));
  const [summary, setSummary] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState('');
  const [quick, setQuick] = useState('ALL');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [checkAll, setCheckAll] = useState(null);
  const [checkNote, setCheckNote] = useState('');
  const [checkBusy, setCheckBusy] = useState(false);
  const [reminding, setReminding] = useState(null);
  const [payment, setPayment] = useState('');
  const [paying, setPaying] = useState(null);
  const [payForm, setPayForm] = useState({ payoutMode: 'UPI', payoutReference: '', payoutNote: '' });
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, eRes] = await Promise.all([
        api.get('/expenses/summary', { params: { month } }),
        api.get('/expenses', { params: { month } })
      ]);
      setSummary(sRes.data.stores || []);
      setExpenses(eRes.data || []);
    } catch (err) {
      toast.error('Failed to load store expenses');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onNotif = (n) => { if (n?.type === 'EXPENSE_RECEIPT') load(); };
    socket.on('new_notification', onNotif);
    return () => socket.off('new_notification', onNotif);
  }, [load]);

  useEffect(() => {
    if (!searchParams.get('month')) return;
    if (isValidMonth(searchParams.get('month'))) setMonth(searchParams.get('month'));
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const refreshSummary = () => api.get('/expenses/summary', { params: { month } }).then((r) => setSummary(r.data.stores || [])).catch(() => {});

  const setCheck = async (expense, checked) => {
    setBusyId(expense._id);
    try {
      const res = await api.put(`/expenses/${expense._id}/check`, { checked });
      setExpenses((prev) => prev.map((e) => (e._id === expense._id ? res.data : e)));
      refreshSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update');
    } finally {
      setBusyId(null);
    }
  };

  const confirmCheckAll = async () => {
    setCheckBusy(true);
    try {
      const res = await api.put('/expenses/check-month', { storeId: checkAll.storeId, month, note: checkNote });
      toast.success(`${res.data.checked} expense${res.data.checked === 1 ? '' : 's'} marked checked for ${checkAll.storeCode}`);
      setCheckAll(null);
      setCheckNote('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not check expenses');
    } finally {
      setCheckBusy(false);
    }
  };

  const openPay = (s) => {
    setPaying(s);
    setPayForm({ payoutMode: 'UPI', payoutReference: '', payoutNote: '' });
  };

  const confirmPay = async () => {
    setPayBusy(true);
    try {
      const res = await api.put('/expenses/pay-month', { storeId: paying.storeId, month, ...payForm });
      toast.success(`${money(res.data.total)} marked paid to ${paying.storeCode}. The store will confirm.`);
      setPaying(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record payment');
    } finally {
      setPayBusy(false);
    }
  };

  const remind = async (s) => {
    setReminding(s.storeId);
    try {
      await api.post('/expenses/remind', { storeId: s.storeId, month });
      toast.success(`Reminder sent to ${s.storeCode}`);
      refreshSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send reminder');
    } finally {
      setReminding(null);
    }
  };

  const filtered = expenses.filter((e) => {
    const term = search.trim().toLowerCase();
    return (!storeFilter || String(e.storeId) === storeFilter)
      && (quick === 'ALL' || e.status === quick)
      && (!category || e.category === category)
      && (!payment || (e.status === 'Checked' && paymentStatusOf(e) === payment))
      && (!term || [e.storeCode, e.storeName, e.category, e.paidTo, e.billNumber, e.description, e.addedBy, String(e.amount)].join(' ').toLowerCase().includes(term));
  });
  const paged = usePagedList(filtered, 15, `${month}|${storeFilter}|${quick}|${category}|${payment}|${search}`);

  const total = expenses.reduce((n, e) => n + Number(e.amount || 0), 0);
  const pendingCount = expenses.filter((e) => e.status !== 'Checked').length;
  const toPayTotal = summary.reduce((n, s) => n + (s.toPayTotal || 0), 0);
  const awaitingStores = summary.filter((s) => s.awaitingConfirm > 0).length;
  const missing = summary.filter((s) => s.count === 0 && s.status !== 'Inactive');
  const scopedForBreakdown = storeFilter ? expenses.filter((e) => String(e.storeId) === storeFilter) : expenses;

  const handleDownload = async () => {
    if (!filtered.length) {
      toast.error('No expenses to download');
      return;
    }
    await downloadExcel(filtered.map(expenseExcelRow), { fileName: `store-expenses-${month}`, sheetName: monthLabel(month) });
  };

  return (
    <Box sx={{ maxWidth: '1440px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Wallet size={26} />}
        title="Store expenses"
        subtitle="Monthly expenses entered by your stores. Check them, and remind stores that have not added theirs."
        actions={<Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownload} sx={{ borderRadius: '12px', fontWeight: 800 }}>Download Excel</Button>}
      />

      <Box sx={{ mb: 2 }}><MonthPicker month={month} onChange={(m) => { setMonth(m); setStoreFilter(''); }} /></Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }, gap: { xs: 1.5, md: 2 }, mb: 2.5 }}>
        <StatCard title="Total spent" value={money(total)} hint={`${expenses.length} entries`} icon={<Wallet size={20} />} />
        <StatCard title="Stores added" value={`${summary.length - missing.length}/${summary.length}`} hint={monthLabel(month)} icon={<StoreIcon size={20} />} accent="#2563EB" />
        <StatCard title="Waiting for check" value={pendingCount} hint="Entries to review" icon={<Clock size={20} />} accent="#D97706" />
        <StatCard title="To pay stores" value={money(toPayTotal)} hint={awaitingStores ? `${awaitingStores} store${awaitingStores === 1 ? '' : 's'} yet to confirm` : 'Checked, not paid yet'} icon={<HandCoins size={20} />} accent="#1D4ED8" />
        <StatCard title="Not added yet" value={missing.length} hint={missing.length ? missing.map((s) => s.storeCode).slice(0, 4).join(', ') : 'Every store added'} icon={<AlertTriangle size={20} />} accent={missing.length ? '#DC2626' : '#16A34A'} />
      </Box>

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden', mb: 2.5 }}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, borderBottom: '1px solid #F1F5F9' }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem' }}>Stores · {monthLabel(month)}</Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 600 }}>Tap a store to see only its expenses</Typography>
        </Box>
        {loading ? (
          <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : summary.length === 0 ? (
          <Box sx={{ p: 2 }}><EmptyState icon={<StoreIcon size={22} />} title="No stores assigned" text="Stores assigned to you will show here." /></Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 1.25, p: { xs: 1.5, md: 2 } }}>
            {summary.map((s) => {
              const active = storeFilter === String(s.storeId);
              const none = s.count === 0;
              const allChecked = !none && s.pending === 0;
              return (
                <Box
                  key={s.storeId}
                  onClick={() => setStoreFilter(active ? '' : String(s.storeId))}
                  sx={{
                    p: 1.75, borderRadius: '14px', cursor: 'pointer', border: '2px solid', minWidth: 0,
                    borderColor: active ? 'primary.main' : none ? '#FECACA' : '#E2E8F0',
                    bgcolor: none ? '#FEF2F2' : '#FFFFFF',
                    '&:hover': { borderColor: 'primary.main' }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>{s.storeCode}</Typography>
                      <Typography noWrap sx={{ color: '#64748B', fontSize: '0.76rem' }}>{s.storeName}</Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 800, color: none ? '#B91C1C' : '#0F172A', fontSize: '1rem', whiteSpace: 'nowrap' }}>{none ? 'Not added' : money(s.total)}</Typography>
                  </Box>
                  {!none && (
                    <Typography sx={{ mt: 0.75, fontSize: '0.76rem', fontWeight: 700, color: allChecked ? '#15803D' : '#B45309' }}>
                      {s.count} entr{s.count === 1 ? 'y' : 'ies'} · {allChecked ? 'all checked' : `${s.pending} waiting for check`}
                    </Typography>
                  )}
                  {(s.toPay > 0 || s.awaitingConfirm > 0 || s.received > 0) && (
                    <Box sx={{ mt: 0.5, display: 'grid', gap: 0.25 }}>
                      {s.received > 0 && <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#15803D' }}>{money(s.receivedTotal)} received by store</Typography>}
                      {s.awaitingConfirm > 0 && <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#1D4ED8' }}>{money(s.awaitingTotal)} paid · waiting for store to confirm</Typography>}
                      {s.notReceived > 0 && <Typography sx={{ fontSize: '0.74rem', fontWeight: 800, color: '#B91C1C' }}>Store says {s.notReceived} payment{s.notReceived === 1 ? '' : 's'} not received</Typography>}
                      {s.toPay > 0 && <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>{money(s.toPayTotal)} checked, not paid yet</Typography>}
                    </Box>
                  )}
                  {s.lastRemindedAt && (
                    <Typography sx={{ mt: 0.5, fontSize: '0.7rem', color: '#64748B' }}>Last reminded {formatDistanceToNowStrict(new Date(s.lastRemindedAt))} ago</Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    {none && (
                      <Button size="small" variant="contained" color="error" disabled={reminding === s.storeId} startIcon={<BellRing size={14} />} onClick={() => remind(s)} sx={{ borderRadius: '10px', fontWeight: 800, flex: 1 }}>
                        Remind store
                      </Button>
                    )}
                    {s.pending > 0 && (
                      <Button size="small" variant="contained" startIcon={<CheckCheck size={14} />} onClick={() => { setCheckAll(s); setCheckNote(''); }} sx={{ borderRadius: '10px', fontWeight: 800, flex: 1 }}>
                        Check all ({s.pending})
                      </Button>
                    )}
                    {s.toPay > 0 && (
                      <Button size="small" variant="outlined" startIcon={<HandCoins size={14} />} onClick={() => openPay(s)} sx={{ borderRadius: '10px', fontWeight: 800, flex: 1, whiteSpace: 'nowrap' }}>
                        {s.notReceived > 0 ? 'Pay again' : 'Mark paid'} ({money(s.toPayTotal)})
                      </Button>
                    )}
                    {allChecked && s.toPay === 0 && (
                      <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#15803D', fontWeight: 800, fontSize: '0.78rem' }}><CheckCircle2 size={14} /> Done</Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Card>

      {scopedForBreakdown.length > 0 && (
        <Card className="white-card" sx={{ borderRadius: '18px', p: { xs: 2, md: 2.5 }, mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem', mb: 1.5 }}>
            By category{storeFilter ? ` · ${summary.find((s) => String(s.storeId) === storeFilter)?.storeCode || ''}` : ' · all stores'}
          </Typography>
          <CategoryBreakdown expenses={scopedForBreakdown} />
        </Card>
      )}

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search store, paid to, bill no., description..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: expenses.length },
              { value: 'Pending', label: 'Waiting', count: pendingCount },
              { value: 'Checked', label: 'Checked', count: expenses.length - pendingCount }
            ]}
            quickValue={quick}
            onQuickChange={setQuick}
            filters={[
              { key: 'store', label: 'Store', value: storeFilter, options: [{ value: '', label: 'All my stores' }, ...summary.map((s) => ({ value: String(s.storeId), label: `${s.storeCode} · ${s.storeName}` }))], onChange: setStoreFilter },
              { key: 'category', label: 'Category', value: category, options: [{ value: '', label: 'All categories' }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))], onChange: setCategory },
              { key: 'payment', label: 'Payment', value: payment, options: [{ value: '', label: 'Any payment' }, ...Object.entries(PAYMENT_STATUS_META).map(([value, m]) => ({ value, label: m.label }))], onChange: setPayment }
            ]}
            resultCount={filtered.length}
            resultLabel="expenses"
          />
        </Box>
        <Box sx={{ p: { xs: 1.5, md: 2 } }}>
          {loading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={30} /></Box>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="No expenses" text={expenses.length ? 'Clear the filters to see everything.' : `Your stores have not added expenses for ${monthLabel(month)}.`} />
          ) : (
            <ExpenseList expenses={paged.visible} showStore onCheck={(e) => setCheck(e, true)} onUncheck={(e) => setCheck(e, false)} busyId={busyId} />
          )}
        </Box>
        {!loading && filtered.length > 0 && <ShowMoreFooter paged={paged} label="expenses" />}
      </Card>

      <Dialog open={Boolean(checkAll)} onClose={() => !checkBusy && setCheckAll(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Check {checkAll?.storeCode} expenses?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: '0.9rem', mb: 2 }}>
            {checkAll?.pending} expense{checkAll?.pending === 1 ? '' : 's'} for {monthLabel(month)} will be marked checked. The store is notified and can no longer edit them.
          </Typography>
          <TextField fullWidth multiline minRows={2} label="Note to store (optional)" value={checkNote} onChange={(e) => setCheckNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCheckAll(null)} disabled={checkBusy} sx={{ fontWeight: 800 }}>Cancel</Button>
          <Button variant="contained" onClick={confirmCheckAll} disabled={checkBusy} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            {checkBusy ? 'Checking...' : 'Mark all checked'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(paying)} onClose={() => !payBusy && setPaying(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Pay {paying?.storeCode} · {money(paying?.toPayTotal)}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: '0.9rem', mb: 2 }}>
            {paying?.toPay} checked expense{paying?.toPay === 1 ? '' : 's'} for {monthLabel(month)} will be marked paid. The store is asked to confirm it received the money.
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>PAID VIA</Typography>
          <ChoiceChips options={PAYMENT_MODES} value={payForm.payoutMode} onChange={(payoutMode) => setPayForm({ ...payForm, payoutMode })} />
          <TextField fullWidth sx={{ mt: 2 }} label="Reference (UTR / cheque no.) — optional" value={payForm.payoutReference} onChange={(e) => setPayForm({ ...payForm, payoutReference: e.target.value })} />
          <TextField fullWidth multiline minRows={2} sx={{ mt: 2 }} label="Note to store (optional)" value={payForm.payoutNote} onChange={(e) => setPayForm({ ...payForm, payoutNote: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPaying(null)} disabled={payBusy} sx={{ fontWeight: 800 }}>Cancel</Button>
          <Button variant="contained" onClick={confirmPay} disabled={payBusy} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            {payBusy ? 'Saving...' : 'Mark paid'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExecutiveExpensesPage;
