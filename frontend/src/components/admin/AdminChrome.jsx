import React from 'react';
import { Box, Typography, Card, InputAdornment, Chip, IconButton, TextField } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Search, Minus, Plus } from 'lucide-react';

export const statusChipClass = (status = '') =>
  `badge-chip status-${status.toLowerCase().replace(/[^a-z]/g, '')}`;

export const dialogPaperSx = {
  borderRadius: '20px',
  p: 0.5,
  bgcolor: '#FFFFFF'
};

export const searchSlotProps = {
  input: {
    startAdornment: (
      <InputAdornment position="start">
        <Search size={18} color="#64748B" />
      </InputAdornment>
    )
  }
};

const useBrand = () => useTheme().palette.brand || { main: '#0D9488', dark: '#0F766E', soft2: '#CCFBF1' };

export const PageHeader = ({ icon, title, subtitle, actions, tone = 'brand' }) => {
  const brand = useBrand();
  const tones = {
    brand: { bg: brand.soft2, color: brand.dark },
    teal: { bg: '#CCFBF1', color: '#0F766E' },
    blue: { bg: '#DBEAFE', color: '#1D4ED8' },
    amber: { bg: '#FEF3C7', color: '#B45309' },
    orange: { bg: '#FFEDD5', color: '#C2410C' }
  };
  const t = tones[tone] || tones.brand;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.75, minWidth: 0 }}>
        <Box sx={{ p: 1.35, bgcolor: t.bg, borderRadius: '14px', color: t.color, display: 'flex', flexShrink: 0 }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: '1.25rem', md: '1.45rem' }, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            {title}
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.88rem', mt: 0.5, lineHeight: 1.5 }}>
            {subtitle}
          </Typography>
        </Box>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
          {actions}
        </Box>
      )}
    </Box>
  );
};

export const StatCard = ({ title, value, hint, accent: accentProp, icon }) => {
  const brand = useBrand();
  const accent = accentProp || brand.main;
  return (
  <Card
    className="white-card"
    sx={{ p: { xs: 2, md: 2.4 }, borderRadius: '16px', height: '100%', position: 'relative', overflow: 'hidden' }}
  >
    <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: accent }} />
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.55px', fontSize: '0.68rem', mb: 0.9 }}>
          {title}
        </Typography>
        <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: '1.7rem', md: '1.9rem' }, lineHeight: 1, letterSpacing: '-0.04em' }}>
          {value}
        </Typography>
        {hint && (
          <Typography sx={{ mt: 0.9, color: '#64748B', fontWeight: 600, fontSize: '0.76rem' }}>{hint}</Typography>
        )}
      </Box>
      {icon && (
        <Box sx={{ width: 42, height: 42, borderRadius: '12px', bgcolor: `${accent}14`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </Box>
      )}
    </Box>
  </Card>
  );
};

export const ChoiceChips = ({ options, value, onChange, color: colorProp }) => {
  const brand = useBrand();
  const color = colorProp || brand.main;
  return (
  <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
    {options.map((opt) => {
      const val = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      const selected = String(value) === String(val);
      return (
        <Chip
          key={String(val)}
          label={label}
          onClick={() => onChange(val)}
          sx={{
            fontWeight: 800,
            borderRadius: '10px',
            bgcolor: selected ? color : '#F1F5F9',
            color: selected ? '#FFFFFF' : '#475569',
            '&:hover': { bgcolor: selected ? color : '#E2E8F0', opacity: selected ? 0.92 : 1 }
          }}
        />
      );
    })}
  </Box>
  );
};

export const QtyStepper = ({ value, onChange, min = 1, max = 9999, presets = [1, 5, 10, 25], color }) => (
  <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      <IconButton size="small" onClick={() => onChange(Math.max(min, Number(value || 0) - 1))} sx={{ bgcolor: '#F1F5F9', border: '1px solid #E2E8F0' }}>
        <Minus size={16} />
      </IconButton>
      <TextField
        size="small"
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        slotProps={{ htmlInput: { min, max } }}
        sx={{ width: 88, '& input': { textAlign: 'center', fontWeight: 800 } }}
      />
      <IconButton size="small" onClick={() => onChange(Math.min(max, Number(value || 0) + 1))} sx={{ bgcolor: '#F1F5F9', border: '1px solid #E2E8F0' }}>
        <Plus size={16} />
      </IconButton>
    </Box>
    <ChoiceChips
      color={color}
      value={Number(value)}
      onChange={onChange}
      options={presets.map((n) => ({ value: n, label: String(n) }))}
    />
  </Box>
);

export const OptionalToggle = ({ open, onToggle, label = 'More details (optional)', color }) => (
  <Typography
    onClick={onToggle}
    sx={{ color: color || 'primary.main', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}
  >
    {open ? 'Hide extra fields' : label}
  </Typography>
);

export const EmptyState = ({ icon, title, text }) => (
  <Box sx={{ py: 6, px: 3, textAlign: 'center' }}>
    <Box sx={{ width: 52, height: 52, borderRadius: '16px', bgcolor: '#F1F5F9', color: '#64748B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 1.4 }}>
      {icon}
    </Box>
    <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.5 }}>{title}</Typography>
    <Typography sx={{ color: '#64748B', fontSize: '0.85rem', maxWidth: 360, mx: 'auto', lineHeight: 1.55 }}>{text}</Typography>
  </Box>
);
