import React from 'react';
import { Box } from '@mui/material';
import { Hash, Store, Pill } from 'lucide-react';
import { notificationContext } from '../utils/notificationLinks';

const TONES = {
  light: {
    request: { bg: '#0F172A', color: '#FFFFFF', border: '#0F172A' },
    store: { bg: '#CCFBF1', color: '#0F766E', border: '#5EEAD4' },
    product: { bg: '#F1F5F9', color: '#334155', border: '#E2E8F0' }
  },
  dark: {
    request: { bg: '#FFFFFF', color: '#0F172A', border: '#FFFFFF' },
    store: { bg: 'rgba(45,212,191,0.18)', color: '#5EEAD4', border: 'rgba(94,234,212,0.5)' },
    product: { bg: 'rgba(148,163,184,0.18)', color: '#E2E8F0', border: 'rgba(148,163,184,0.35)' }
  },
  store: {
    request: { bg: '#C2410C', color: '#FFFFFF', border: '#C2410C' },
    store: { bg: '#FFEDD5', color: '#9A3412', border: '#FDBA74' },
    product: { bg: '#FFF7ED', color: '#7C2D12', border: '#FED7AA' }
  }
};

const ContextPill = ({ tone, icon, children, strong }) => (
  <Box
    component="span"
    title={typeof children === 'string' ? children : undefined}
    sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%',
      px: 0.9, py: 0.3, borderRadius: '7px', border: `1px solid ${tone.border}`,
      bgcolor: tone.bg, color: tone.color,
      fontSize: '0.72rem', fontWeight: strong ? 800 : 700, lineHeight: 1.3,
      letterSpacing: strong ? '0.02em' : 0
    }}
  >
    <Box component="span" sx={{ display: 'flex', flexShrink: 0 }}>{icon}</Box>
    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</Box>
  </Box>
);

/**
 * Highlighted Request ID + Store code / name (+ medicine) for a notification.
 * variant: 'light' (admin panels), 'dark' (admin toast), 'store' (orange store UI)
 */
const NotificationContext = ({ notif, variant = 'light', showStore = true, showProduct = false, sx }) => {
  const { requestCode, storeCode, storeName, productName } = notificationContext(notif);
  const tones = TONES[variant] || TONES.light;
  const store = showStore && (storeCode || storeName) ? [storeCode, storeName].filter(Boolean).join(' · ') : '';
  if (!requestCode && !store && !(showProduct && productName)) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mt: 0.6, minWidth: 0, ...sx }}>
      {requestCode && <ContextPill tone={tones.request} icon={<Hash size={11} />} strong>{requestCode}</ContextPill>}
      {store && <ContextPill tone={tones.store} icon={<Store size={11} />} strong>{store}</ContextPill>}
      {showProduct && productName && <ContextPill tone={tones.product} icon={<Pill size={11} />}>{productName}</ContextPill>}
    </Box>
  );
};

export default NotificationContext;
