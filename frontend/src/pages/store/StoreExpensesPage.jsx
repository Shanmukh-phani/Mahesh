import React, { useCallback, useEffect, useState } from 'react';
import { Box, Card, Button, CircularProgress, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Wallet, PlusCircle, Download, CheckCircle2, Clock, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';
import { downloadExcel } from '../../utils/exportExcel';
import { currentMonth, isValidMonth, monthLabel, money, expenseExcelRow, EXPENSE_CATEGORIES, EXPENSES_CHANGED_EVENT, PAYMENT_STATUS_META, paymentStatusOf } from '../../utils/expenses';
import FilterBar, { usePagedList, ShowMoreFooter } from '../../components/FilterBar';
import { PageHeader, StatCard, EmptyState, dialogPaperSx } from '../../components/admin/AdminChrome';
import { MonthPicker, CategoryBreakdown } from '../../components/expenses/ExpenseBits';
import ExpenseList from '../../components/expenses/ExpenseList';
import ExpenseFormDialog from '../../components/expenses/ExpenseFormDialog';
import ExpenseReminderBanner from '../../components/expenses/ExpenseReminderBanner';
import ExpensePaymentConfirm from '../../components/expenses/ExpensePaymentConfirm';

const announceChange = () => window.dispatchEvent(new Event(EXPENSES_CHANGED_EVENT));

const StoreExpensesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => (isValidMonth(searchParams.get('month')) ? searchParams.get('month') : currentMonth()));
  const [expenses, setExpenses] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState('ALL');
  const [category, setCategory] = useState('');
  const [payment, setPayment] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, sRes] = await Promise.all([
        api.get('/expenses', { params: { month } }),
        api.get('/expenses/status').catch(() => ({ data: null }))
      ]);
      setExpenses(eRes.data || []);
      setStatus(sRes.data);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Deep links: ?month=YYYY-MM (from reminders) and ?add=1 (from the dashboard banner)
  useEffect(() => {
    const m = searchParams.get('month');
    const add = searchParams.get('add');
    if (!m && !add) return;
    if (isValidMonth(m)) setMonth(m);
    if (add) { setEditing(null); setFormOpen(true); }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onNotif = (n) => { if (n?.type === 'EXPENSE_CHECKED' || n?.type === 'EXPENSE_PAID') load(); };
    socket.on('new_notification', onNotif);
    return () => socket.off('new_notification', onNotif);
  }, [load]);

  const filtered = expenses.filter((e) => {
    const term = search.trim().toLowerCase();
    return (!term || [e.category, e.paidTo, e.billNumber, e.description, e.addedBy, e.paymentMode, String(e.amount)].join(' ').toLowerCase().includes(term))
      && (quick === 'ALL' || e.status === quick)
      && (!category || e.category === category)
      && (!payment || (e.status === 'Checked' && paymentStatusOf(e) === payment));
  });
  const paged = usePagedList(filtered, 15, `${month}|${search}|${quick}|${category}|${payment}`);

  const total = expenses.reduce((n, e) => n + Number(e.amount || 0), 0);
  const checked = expenses.filter((e) => e.status === 'Checked');
  const pending = expenses.length - checked.length;

  const openAdd = (forMonth) => {
    if (forMonth && forMonth !== month) setMonth(forMonth);
    setEditing(null);
    setFormOpen(true);
  };

  const handleSaved = (saved, wasEdit) => {
    setFormOpen(false);
    setEditing(null);
    if (saved.month !== month) {
      setMonth(saved.month);
      toast(`Saved under ${monthLabel(saved.month)}`);
    } else if (wasEdit) {
      setExpenses((prev) => prev.map((e) => (e._id === saved._id ? saved : e)));
    } else {
      setExpenses((prev) => [saved, ...prev].sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate)));
    }
    api.get('/expenses/status').then((r) => setStatus(r.data)).catch(() => {});
    announceChange();
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.delete(`/expenses/${deleting._id}`);
      setExpenses((prev) => prev.filter((e) => e._id !== deleting._id));
      toast.success('Expense deleted');
      setDeleting(null);
      api.get('/expenses/status').then((r) => setStatus(r.data)).catch(() => {});
      announceChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!filtered.length) {
      toast.error('No expenses to download');
      return;
    }
    await downloadExcel(filtered.map(expenseExcelRow), { fileName: `expenses-${filtered[0].storeCode || 'store'}-${month}`, sheetName: monthLabel(month) });
  };

  return (
    <Box sx={{ maxWidth: '1300px', mx: 'auto' }} className="animate-fade-in">
      <PageHeader
        icon={<Wallet size={26} />}
        title="Monthly expenses"
        subtitle="Add every store expense here (rent, electricity, salaries, repairs...). Your executive officer checks them each month."
        actions={(
          <>
            <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownload} sx={{ borderRadius: '12px', fontWeight: 800 }}>Download Excel</Button>
            <Button variant="contained" color="secondary" startIcon={<PlusCircle size={16} />} onClick={() => openAdd()} sx={{ borderRadius: '12px', fontWeight: 800 }}>Add expense</Button>
          </>
        )}
      />

      <ExpenseReminderBanner status={status} onAdd={openAdd} sx={{ mb: 2.5 }} />
      <ExpensePaymentConfirm status={status} onDone={(m) => { if (m !== month) setMonth(m); else load(); announceChange(); }} sx={{ mb: 2.5 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <MonthPicker month={month} onChange={setMonth} />
        {expenses.length > 0 && pending === 0 && (
          <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: '#15803D', fontWeight: 800, fontSize: '0.85rem' }}>
            <CheckCircle2 size={16} /> All {monthLabel(month)} expenses are checked
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.5, md: 2 }, mb: 2.5 }}>
        <StatCard title="Total spent" value={money(total)} hint={monthLabel(month)} icon={<Wallet size={20} />} accent="#EA580C" />
        <StatCard title="Entries" value={expenses.length} hint="Expense lines added" icon={<Receipt size={20} />} accent="#2563EB" />
        <StatCard title="Checked" value={checked.length} hint={money(checked.reduce((n, e) => n + Number(e.amount || 0), 0))} icon={<CheckCircle2 size={20} />} accent="#16A34A" />
        <StatCard title="Waiting for check" value={pending} hint="You can still edit these" icon={<Clock size={20} />} accent="#D97706" />
      </Box>

      {expenses.length > 0 && (
        <Card className="white-card" sx={{ borderRadius: '18px', p: { xs: 2, md: 2.5 }, mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem', mb: 1.5 }}>Where the money went</Typography>
          <CategoryBreakdown expenses={expenses} />
        </Card>
      )}

      <Card className="white-card" sx={{ borderRadius: '18px', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #F1F5F9' }}>
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search paid to, bill no., description, amount..."
            quickFilters={[
              { value: 'ALL', label: 'All', count: expenses.length },
              { value: 'Pending', label: 'Waiting', count: pending },
              { value: 'Checked', label: 'Checked', count: checked.length }
            ]}
            quickValue={quick}
            onQuickChange={setQuick}
            filters={[
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
            <EmptyState
              icon={<Wallet size={22} />}
              title={expenses.length ? 'No expenses match' : `No expenses for ${monthLabel(month)}`}
              text={expenses.length ? 'Clear the filters to see everything.' : 'Tap "Add expense" each time you pay rent, bills, salaries or repairs.'}
            />
          ) : (
            <ExpenseList expenses={paged.visible} onEdit={(e) => { setEditing(e); setFormOpen(true); }} onDelete={setDeleting} />
          )}
        </Box>
        {!loading && filtered.length > 0 && <ShowMoreFooter paged={paged} label="expenses" />}
      </Card>

      <ExpenseFormDialog open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={handleSaved} expense={editing} month={month} />

      <Dialog open={Boolean(deleting)} onClose={() => !deleteBusy && setDeleting(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete this expense?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: '0.9rem' }}>
            {deleting ? `${deleting.category} · ${money(deleting.amount)}` : ''} will be removed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleting(null)} disabled={deleteBusy} sx={{ fontWeight: 800 }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={deleteBusy} sx={{ borderRadius: '10px', fontWeight: 800 }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StoreExpensesPage;
