import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  LogIn, Timer, ClipboardList, MessageSquareWarning, Boxes, Store, Users, ShieldCheck, UserRound, Pill, Bell, MousePointerClick, FileSpreadsheet, Server, Activity, Wallet
} from 'lucide-react';
import { categoryInfo, roleLabel, ROLE_COLORS, SESSION_STATUS } from './activityUtils';

const ICONS = {
  AUTH: LogIn,
  SESSION: Timer,
  REQUEST: ClipboardList,
  COMPLAINT: MessageSquareWarning,
  INVENTORY: Boxes,
  STORE: Store,
  EMPLOYEE: Users,
  USER: ShieldCheck,
  CUSTOMER: UserRound,
  MEDICINE: Pill,
  NOTIFICATION: Bell,
  EXPENSE: Wallet,
  NAVIGATION: MousePointerClick,
  EXPORT: FileSpreadsheet,
  SYSTEM: Server
};

export const CategoryIcon = ({ category, failed, size = 36 }) => {
  const Icon = ICONS[category] || Activity;
  const color = failed ? '#DC2626' : categoryInfo(category).color;
  return (
    <Box sx={{ width: size, height: size, borderRadius: '11px', bgcolor: `${color}17`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={Math.round(size * 0.48)} />
    </Box>
  );
};

export const Pill2 = ({ label, bg, color, sx }) => (
  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', px: 0.9, py: 0.2, borderRadius: '7px', bgcolor: bg, color, fontWeight: 800, fontSize: '0.68rem', whiteSpace: 'nowrap', lineHeight: 1.6, ...sx }}>
    {label}
  </Box>
);

export const RoleChip = ({ role, adminLevel, designation }) => {
  const c = ROLE_COLORS[role] || ROLE_COLORS.GUEST;
  return <Pill2 label={roleLabel(role, adminLevel, designation)} bg={c.bg} color={c.color} />;
};

export const SessionStatusChip = ({ status }) => {
  const s = SESSION_STATUS[status] || { label: status, bg: '#F1F5F9', color: '#475569' };
  return (
    <Pill2
      label={(
        <>
          {status === 'ONLINE' && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22C55E', mr: 0.6, display: 'inline-block' }} />}
          {s.label}
        </>
      )}
      bg={s.bg}
      color={s.color}
    />
  );
};

export const MetaLine = ({ children }) => (
  <Typography component="div" sx={{ color: '#64748B', fontSize: '0.74rem', fontWeight: 600, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.4, mt: 0.4 }}>
    {children}
  </Typography>
);
