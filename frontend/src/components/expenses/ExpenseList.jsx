import React from 'react';
import { Box, Typography, Button, IconButton, Tooltip, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { Pencil, Trash2, CheckCircle2, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { money } from '../../utils/expenses';
import { StatusPill, PaymentPill, CategoryDot } from './ExpenseBits';

const fmtDay = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');
const fmtTime = (d) => (d ? format(new Date(d), 'dd MMM, hh:mm a') : '');

/**
 * Store: onEdit / onDelete (only while waiting for check).
 * Executive: onCheck / onUncheck, showStore.
 */
const ExpenseList = ({ expenses, showStore, onEdit, onDelete, onCheck, onUncheck, busyId }) => {
  const actions = (e, full) => {
    const pending = e.status !== 'Checked';
    return (
      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: full ? 'stretch' : 'flex-end', flexWrap: 'wrap' }}>
        {onCheck && pending && (
          <Button size="small" variant="contained" disabled={busyId === e._id} fullWidth={full} startIcon={<CheckCircle2 size={14} />} onClick={() => onCheck(e)} sx={{ borderRadius: '10px', fontWeight: 800, whiteSpace: 'nowrap', flex: full ? 1 : 'none' }}>
            Mark checked
          </Button>
        )}
        {onUncheck && !pending && !['Paid', 'Received'].includes(e.paymentStatus) && (
          <Tooltip title="Undo check">
            <span>
              <IconButton size="small" disabled={busyId === e._id} onClick={() => onUncheck(e)} aria-label="Undo check"><Undo2 size={16} /></IconButton>
            </span>
          </Tooltip>
        )}
        {onEdit && pending && (
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => onEdit(e)} aria-label="Edit expense"><Pencil size={16} /></IconButton>
          </Tooltip>
        )}
        {onDelete && pending && (
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => onDelete(e)} aria-label="Delete expense"><Trash2 size={16} /></IconButton>
          </Tooltip>
        )}
      </Box>
    );
  };

  const checkLine = (e) => (e.status === 'Checked' && e.checkedBy ? (
    <Typography sx={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 700, mt: 0.4 }}>
      Checked by {e.checkedBy}{e.checkedAt ? ` · ${fmtTime(e.checkedAt)}` : ''}{e.checkNote ? ` · "${e.checkNote}"` : ''}
    </Typography>
  ) : null);

  const paymentLines = (e) => (
    <>
      {e.paidAt && (
        <Typography sx={{ fontSize: '0.72rem', color: '#1D4ED8', fontWeight: 700, mt: 0.4 }}>
          Paid by {e.paidBy || '—'} · {fmtTime(e.paidAt)}{e.payoutMode ? ` · ${e.payoutMode}` : ''}{e.payoutReference ? ` · Ref ${e.payoutReference}` : ''}{e.payoutNote ? ` · "${e.payoutNote}"` : ''}
        </Typography>
      )}
      {e.receiptAt && (
        <Typography sx={{ fontSize: '0.72rem', color: e.paymentStatus === 'Not received' ? '#B91C1C' : '#15803D', fontWeight: 700, mt: 0.4 }}>
          {e.paymentStatus === 'Not received' ? 'Not received' : 'Received'} · confirmed by {e.receiptBy || 'store'} · {fmtTime(e.receiptAt)}{e.receiptNote ? ` · "${e.receiptNote}"` : ''}
        </Typography>
      )}
    </>
  );

  return (
    <>
      <Box sx={{ display: { xs: 'grid', lg: 'none' }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
        {expenses.map((e) => (
          <Box key={e._id} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', bgcolor: '#FFFFFF', minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <CategoryDot category={e.category} />
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>{e.category}</Typography>
                </Box>
                <Typography sx={{ color: '#64748B', fontSize: '0.76rem', fontWeight: 600, mt: 0.3 }}>
                  {fmtDay(e.expenseDate)}{showStore && e.storeCode ? ` · ${e.storeCode}` : ''} · {e.paymentMode}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1rem', whiteSpace: 'nowrap' }}>{money(e.amount)}</Typography>
            </Box>
            {(e.paidTo || e.billNumber || e.description) && (
              <Typography sx={{ color: '#334155', fontSize: '0.8rem', mt: 1, wordBreak: 'break-word' }}>
                {[e.paidTo && `Paid to ${e.paidTo}`, e.billNumber && `Bill ${e.billNumber}`, e.description].filter(Boolean).join(' · ')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              <StatusPill status={e.status} />
              <PaymentPill expense={e} />
              <Typography sx={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600 }}>Added by {e.addedBy || '—'}</Typography>
            </Box>
            {checkLine(e)}
            {paymentLines(e)}
            <Box sx={{ mt: 1.25 }}>{actions(e, true)}</Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: { xs: 'none', lg: 'block' }, overflowX: 'auto' }}>
        <Table size="small" sx={{ '& th': { fontWeight: 800, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }, '& td': { fontSize: '0.84rem', color: '#0F172A' } }}>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              {showStore && <TableCell>Store</TableCell>}
              <TableCell>Category</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>Paid by</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e._id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDay(e.expenseDate)}</TableCell>
                {showStore && <TableCell><b>{e.storeCode}</b></TableCell>}
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><CategoryDot category={e.category} />{e.category}</Box>
                </TableCell>
                <TableCell sx={{ maxWidth: 320 }}>
                  <Typography sx={{ fontSize: '0.82rem', wordBreak: 'break-word' }}>
                    {[e.paidTo && `Paid to ${e.paidTo}`, e.billNumber && `Bill ${e.billNumber}`, e.description].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#94A3B8' }}>Added by {e.addedBy || '—'}</Typography>
                </TableCell>
                <TableCell>{e.paymentMode}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{money(e.amount)}</TableCell>
                <TableCell sx={{ maxWidth: 300 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <StatusPill status={e.status} />
                    <PaymentPill expense={e} />
                  </Box>
                  {checkLine(e)}
                  {paymentLines(e)}
                </TableCell>
                <TableCell align="right">{actions(e)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </>
  );
};

export default ExpenseList;
