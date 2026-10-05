import React from 'react';
import { Box, Typography, IconButton, Button, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { currentMonth, shiftMonth, monthLabel, money, categoryTotals, CATEGORY_COLORS, PAYMENT_STATUS_META, paymentStatusOf } from '../../utils/expenses';

export const MonthPicker = ({ month, onChange }) => {
  const isCurrent = month >= currentMonth();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', p: 0.5, flexWrap: 'nowrap', maxWidth: '100%' }}>
      <Tooltip title="Previous month">
        <IconButton size="small" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></IconButton>
      </Tooltip>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, minWidth: 0 }}>
        <CalendarDays size={16} color="#64748B" />
        <Typography noWrap sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>{monthLabel(month)}</Typography>
      </Box>
      <Tooltip title="Next month">
        <span>
          <IconButton size="small" disabled={isCurrent} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={18} /></IconButton>
        </span>
      </Tooltip>
      {!isCurrent && (
        <Button size="small" onClick={() => onChange(currentMonth())} sx={{ fontWeight: 800, borderRadius: '10px', whiteSpace: 'nowrap' }}>This month</Button>
      )}
    </Box>
  );
};

export const StatusPill = ({ status }) => {
  const checked = status === 'Checked';
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.25, borderRadius: '8px', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap', bgcolor: checked ? '#DCFCE7' : '#FEF3C7', color: checked ? '#15803D' : '#B45309' }}>
      {checked ? 'Checked' : 'Waiting for check'}
    </Box>
  );
};

export const PaymentPill = ({ expense }) => {
  if (expense?.status !== 'Checked') return null;
  const meta = PAYMENT_STATUS_META[paymentStatusOf(expense)] || PAYMENT_STATUS_META.Unpaid;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.25, borderRadius: '8px', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap', bgcolor: meta.bg, color: meta.color }}>
      {meta.label}
    </Box>
  );
};

export const CategoryDot = ({ category }) => (
  <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CATEGORY_COLORS[category] || '#64748B', display: 'inline-block', flexShrink: 0 }} />
);

export const CategoryBreakdown = ({ expenses }) => {
  const rows = categoryTotals(expenses);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 1.25 }}>
      {rows.map(([cat, total]) => (
        <Box key={cat}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <CategoryDot category={cat} />
              <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>{cat}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>{money(total)}</Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: 8, bgcolor: '#F1F5F9', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${Math.max(3, (total / max) * 100)}%`, bgcolor: CATEGORY_COLORS[cat] || '#64748B', borderRadius: 8 }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
};
