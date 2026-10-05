import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Wallet, AlertTriangle, PlusCircle } from 'lucide-react';

// status = GET /expenses/status. Shows nothing when this month (and last month, early in the month) already have expenses.
const ExpenseReminderBanner = ({ status, onAdd, sx }) => {
  const r = status?.reminder;
  if (!r) return null;
  const urgent = r.kind !== 'CURRENT';
  const title = r.kind === 'PREVIOUS'
    ? `${r.label} expenses are missing`
    : r.kind === 'MONTH_END'
      ? `Month is ending: add ${r.label} expenses`
      : `No expenses added for ${r.label} yet`;
  const text = r.kind === 'PREVIOUS'
    ? 'Add last month\'s rent, electricity, salaries and other costs so your executive officer can check them.'
    : 'Add your store expenses as you pay them (rent, electricity, salaries, repairs...). Your executive officer checks them every month.';
  const color = urgent ? '#B45309' : '#C2410C';

  return (
    <Box sx={{
      display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5, flexDirection: { xs: 'column', sm: 'row' },
      p: { xs: 1.75, md: 2 }, borderRadius: '16px', border: '1px solid', borderColor: urgent ? '#FCD34D' : '#FED7AA',
      bgcolor: urgent ? '#FFFBEB' : '#FFF7ED', ...sx
    }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <Box sx={{ p: 1, borderRadius: '12px', bgcolor: '#FFFFFF', color, display: 'flex', flexShrink: 0 }}>
          {urgent ? <AlertTriangle size={20} /> : <Wallet size={20} />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>{title}</Typography>
          <Typography sx={{ color: '#475569', fontSize: '0.8rem', mt: 0.3 }}>{text}</Typography>
        </Box>
      </Box>
      <Button variant="contained" color="secondary" startIcon={<PlusCircle size={16} />} onClick={() => onAdd(r.month)} sx={{ borderRadius: '10px', fontWeight: 800, whiteSpace: 'nowrap', width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}>
        Add {r.kind === 'PREVIOUS' ? 'last month\'s' : ''} expenses
      </Button>
    </Box>
  );
};

export default ExpenseReminderBanner;
