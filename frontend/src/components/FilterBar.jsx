import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Button, Badge, Popover, Chip, Menu, MenuItem, InputAdornment, IconButton, Divider
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Search, SlidersHorizontal, ArrowUpDown, X, Check, ChevronDown } from 'lucide-react';

export const DATE_RANGES = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' }
];

export const inDateRange = (date, range) => {
  if (!range) return true;
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  if (range === 'today') return d.toDateString() === now.toDateString();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 0;
  return days ? now - d <= days * 24 * 60 * 60 * 1000 : true;
};

export const usePagedList = (items, pageSize = 10, resetKey = '') => {
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => { setLimit(pageSize); }, [resetKey, pageSize]);
  return {
    visible: items.slice(0, limit),
    total: items.length,
    shown: Math.min(limit, items.length),
    hasMore: items.length > limit,
    showMore: () => setLimit((l) => l + pageSize),
    showAll: () => setLimit(items.length)
  };
};

export const ShowMoreFooter = ({ paged, label = 'items' }) => {
  if (paged.total === 0) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: '1px solid #F1F5F9' }}>
      <Typography sx={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 700 }}>
        Showing {paged.shown} of {paged.total} {label}
      </Typography>
      {paged.hasMore && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={paged.showMore} endIcon={<ChevronDown size={14} />} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            Show more
          </Button>
          <Button size="small" onClick={paged.showAll} sx={{ borderRadius: '10px', fontWeight: 800, color: '#64748B' }}>
            Show all
          </Button>
        </Box>
      )}
    </Box>
  );
};

const OptionPills = ({ options, value, onChange, brand }) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
    {options.map((opt) => {
      const active = String(value) === String(opt.value);
      return (
        <Box
          key={String(opt.value)}
          component="button"
          type="button"
          onClick={() => onChange(opt.value)}
          sx={{
            border: '1px solid',
            borderColor: active ? 'primary.main' : '#E2E8F0',
            bgcolor: active ? brand.soft : '#FFFFFF',
            color: active ? brand.dark : '#475569',
            fontFamily: 'inherit',
            fontWeight: 800,
            fontSize: '0.78rem',
            px: 1.25,
            py: 0.6,
            borderRadius: '9px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            transition: 'all 0.12s ease',
            '&:hover': { borderColor: 'primary.main' }
          }}
        >
          {active && <Check size={13} />}
          {opt.label}
        </Box>
      );
    })}
  </Box>
);

/**
 * quickFilters: [{ value, label, count }] shown as segmented tabs
 * filters: [{ key, label, value, options: [{ value, label }], onChange, defaultValue }] shown in the Filters panel
 * sort: { value, options: [{ value, label }], onChange }
 */
const FilterBar = ({
  search,
  onSearch,
  placeholder = 'Search...',
  quickFilters,
  quickValue,
  onQuickChange,
  filters = [],
  sort,
  resultCount,
  resultLabel = 'results'
}) => {
  const theme = useTheme();
  const brand = theme.palette.brand || { main: theme.palette.primary.main, dark: theme.palette.primary.dark, soft: '#F8FAFC' };
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [sortAnchor, setSortAnchor] = useState(null);

  const activeFilters = useMemo(
    () => filters.filter((f) => String(f.value ?? '') !== String(f.defaultValue ?? '')),
    [filters]
  );
  const sortLabel = sort?.options.find((o) => o.value === sort.value)?.label;
  const hasAnyActive = activeFilters.length > 0 || Boolean(search);

  const clearAll = () => {
    filters.forEach((f) => f.onChange(f.defaultValue ?? ''));
    if (onSearch) onSearch('');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'center' }}>
        {onSearch && (
          <TextField
            size="small"
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><Search size={17} color="#64748B" /></InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => onSearch('')} aria-label="Clear search"><X size={15} /></IconButton>
                  </InputAdornment>
                ) : null
              }
            }}
            sx={{ flex: 1, minWidth: { xs: '100%', md: 220 }, '& .MuiOutlinedInput-root': { bgcolor: '#FFFFFF' } }}
          />
        )}

        <Box sx={{ display: 'flex', gap: 1, flex: { xs: 1, md: 'none' } }}>
          {filters.length > 0 && (
            <Button
              variant="outlined"
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              startIcon={(
                <Badge badgeContent={activeFilters.length} color="primary" sx={{ '& .MuiBadge-badge': { right: -2, top: -2 } }}>
                  <SlidersHorizontal size={16} />
                </Badge>
              )}
              sx={{
                flex: { xs: 1, md: 'none' },
                borderRadius: '10px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                py: 0.85,
                bgcolor: activeFilters.length ? brand.soft : '#FFFFFF',
                borderColor: activeFilters.length ? 'primary.main' : '#E2E8F0',
                color: activeFilters.length ? brand.dark : '#334155'
              }}
            >
              Filters
            </Button>
          )}
          {sort && (
            <Button
              variant="outlined"
              onClick={(e) => setSortAnchor(e.currentTarget)}
              startIcon={<ArrowUpDown size={16} />}
              sx={{ flex: { xs: 1, md: 'none' }, borderRadius: '10px', fontWeight: 800, whiteSpace: 'nowrap', py: 0.85, bgcolor: '#FFFFFF', borderColor: '#E2E8F0', color: '#334155' }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, color: '#94A3B8', mr: 0.5, fontWeight: 700 }}>Sort:</Box>
              {sortLabel}
            </Button>
          )}
        </Box>
      </Box>

      {quickFilters && quickFilters.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: '#F1F5F9', borderRadius: '12px', overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {quickFilters.map((q) => {
            const active = String(quickValue) === String(q.value);
            return (
              <Box
                key={String(q.value)}
                component="button"
                type="button"
                onClick={() => onQuickChange(q.value)}
                sx={{
                  flex: { xs: '0 0 auto', sm: 1 },
                  border: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  px: 1.5,
                  py: 0.85,
                  borderRadius: '9px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.75,
                  bgcolor: active ? '#FFFFFF' : 'transparent',
                  color: active ? brand.dark : '#64748B',
                  boxShadow: active ? '0 1px 3px rgba(15, 23, 42, 0.12)' : 'none',
                  transition: 'all 0.15s ease',
                  '&:hover': { color: active ? brand.dark : '#0F172A' }
                }}
              >
                {q.label}
                {q.count !== undefined && (
                  <Box component="span" sx={{ px: 0.75, py: 0.05, borderRadius: '99px', fontSize: '0.7rem', bgcolor: active ? brand.main : '#E2E8F0', color: active ? '#FFFFFF' : '#64748B' }}>
                    {q.count}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {(hasAnyActive || resultCount !== undefined) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {resultCount !== undefined && (
            <Typography sx={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 700, mr: 0.5 }}>
              {resultCount} {resultLabel}
            </Typography>
          )}
          {search && (
            <Chip size="small" label={`"${search}"`} onDelete={() => onSearch('')} sx={{ fontWeight: 700, bgcolor: '#F1F5F9' }} />
          )}
          {activeFilters.map((f) => (
            <Chip
              key={f.key}
              size="small"
              label={`${f.label}: ${f.options.find((o) => String(o.value) === String(f.value))?.label || f.value}`}
              onDelete={() => f.onChange(f.defaultValue ?? '')}
              sx={{ fontWeight: 700, bgcolor: brand.soft, color: brand.dark, '& .MuiChip-deleteIcon': { color: brand.dark, opacity: 0.6 } }}
            />
          ))}
          {hasAnyActive && (
            <Button size="small" onClick={clearAll} sx={{ fontWeight: 800, color: '#64748B', minWidth: 0, px: 1 }}>
              Clear all
            </Button>
          )}
        </Box>
      )}

      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 340, maxWidth: 'calc(100vw - 24px)', mt: 1, borderRadius: '16px', overflow: 'hidden' } }}
      >
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>Filters</Typography>
          {activeFilters.length > 0 && (
            <Button size="small" onClick={() => filters.forEach((f) => f.onChange(f.defaultValue ?? ''))} sx={{ fontWeight: 800, color: '#64748B' }}>
              Reset
            </Button>
          )}
        </Box>
        <Divider />
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '60vh', overflowY: 'auto' }}>
          {filters.map((f) => (
            <Box key={f.key}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: '#64748B', letterSpacing: '0.5px', textTransform: 'uppercase', mb: 0.9 }}>
                {f.label}
              </Typography>
              <OptionPills options={f.options} value={f.value ?? ''} onChange={f.onChange} brand={brand} />
            </Box>
          ))}
        </Box>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Button fullWidth variant="contained" onClick={() => setFilterAnchor(null)} sx={{ borderRadius: '10px', fontWeight: 800 }}>
            Show {resultCount !== undefined ? `${resultCount} ` : ''}{resultLabel}
          </Button>
        </Box>
      </Popover>

      {sort && (
        <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          {sort.options.map((o) => (
            <MenuItem key={o.value} selected={o.value === sort.value} onClick={() => { sort.onChange(o.value); setSortAnchor(null); }} sx={{ gap: 1, minWidth: 190 }}>
              <Box sx={{ width: 16, display: 'flex' }}>{o.value === sort.value && <Check size={15} />}</Box>
              {o.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </Box>
  );
};

export default FilterBar;
