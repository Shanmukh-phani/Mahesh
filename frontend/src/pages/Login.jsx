import React, { useState, useContext } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, IconButton, InputAdornment
} from '@mui/material';
import {
  Activity, Lock, User, Eye, EyeOff, ShieldCheck, Store, Package, Radio
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';

const highlights = [
  {
    icon: <Package size={18} />,
    title: 'Central warehouse stock',
    text: 'Track batches, expiry, and reorder levels from one desk.'
  },
  {
    icon: <Radio size={18} />,
    title: 'Live requisitions',
    text: 'Branch requests land instantly for review and fulfillment.'
  },
  {
    icon: <Store size={18} />,
    title: 'Mini-store portals',
    text: 'Every employee signs in with their own login, so each request shows who raised it.'
  }
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('Enter your username or store ID');
      return;
    }
    if (!password) {
      toast.error('Enter your password');
      return;
    }
    const res = await login(username, password);
    if (!res.success) {
      toast.error(res.error || 'Login failed');
    } else {
      toast.success('Welcome back to MedConnect!');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.05fr) minmax(0, 1fr)' },
        bgcolor: '#F8FAFC'
      }}
    >
      {/* Brand panel */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: { xs: 'flex-start', md: 'space-between' },
          color: 'white',
          px: { xs: 3, sm: 5, md: 7 },
          py: { xs: 2.5, sm: 4, md: 6 },
          background: 'linear-gradient(160deg, #042F2E 0%, #0F766E 48%, #0D9488 100%)',
          minHeight: { xs: 'auto', md: '100vh' }
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              radial-gradient(circle at 18% 22%, rgba(255,255,255,0.14) 0%, transparent 32%),
              radial-gradient(circle at 88% 78%, rgba(45,212,191,0.22) 0%, transparent 36%),
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: 'auto, auto, 48px 48px, 48px 48px',
            pointerEvents: 'none'
          }}
        />

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: { xs: 2, md: 6 } }}>
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: '14px',
                bgcolor: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)'
              }}
            >
              <Activity size={24} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.1 }}>
                MedConnect
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(204,251,241,0.85)', fontWeight: 700, letterSpacing: '0.4px' }}>
                Warehouse & branch command
              </Typography>
            </Box>
          </Box>

          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.45rem', sm: '2.1rem', md: '2.55rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              maxWidth: 460,
              mb: 1.5
            }}
          >
            One portal for every store and the main warehouse.
          </Typography>
          <Typography
            sx={{
              color: 'rgba(204,251,241,0.92)',
              fontSize: { xs: '0.92rem', md: '1rem' },
              maxWidth: 420,
              lineHeight: 1.6,
              display: { xs: 'none', sm: 'block' }
            }}
          >
            Sign in to review requisitions, move inventory, and keep branch demand in sync.
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1, mt: { xs: 0, md: 5 }, display: { xs: 'none', md: 'block' } }}>
          {highlights.map((item) => (
            <Box
              key={item.title}
              sx={{
                display: 'flex',
                gap: 1.75,
                mb: 2.25,
                p: 1.75,
                borderRadius: '16px',
                bgcolor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: '10px',
                  bgcolor: 'rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {item.icon}
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={800}>{item.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(204,251,241,0.86)', mt: 0.25 }}>
                  {item.text}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 1,
            mt: 2
          }}
        >
          <ShieldCheck size={16} />
          <Typography variant="caption" sx={{ color: 'rgba(204,251,241,0.8)', fontWeight: 600 }}>
            Role-based access for admins, executive officers and store staff
          </Typography>
        </Box>
      </Box>

      {/* Form panel */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2.5, sm: 4, md: 6 },
          py: { xs: 4, md: 6 },
          background: {
            xs: 'radial-gradient(ellipse at 50% 0%, #CCFBF1 0%, #F8FAFC 55%)',
            md: '#F8FAFC'
          }
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 440 }} className="animate-fade-in">
          <Box sx={{ mb: 3.5 }}>
            <Typography
              variant="caption"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.8,
                color: '#0F766E',
                bgcolor: '#CCFBF1',
                border: '1px solid #99F6E4',
                px: 1.25,
                py: 0.45,
                borderRadius: '999px',
                fontWeight: 800,
                letterSpacing: '0.4px',
                mb: 1.75
              }}
            >
              <span className="live-pulse-dot" />
              SECURE SIGN IN
            </Typography>
            <Typography
              variant="h4"
              fontWeight={800}
              color="#0F172A"
              sx={{ fontSize: { xs: '1.7rem', sm: '2rem' }, letterSpacing: '-0.03em' }}
            >
              Welcome back
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.6 }}>
              Enter your username to open the admin, executive or branch portal.
            </Typography>
          </Box>

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              bgcolor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '20px',
              p: { xs: 2.5, sm: 3.25 },
              boxShadow: '0 16px 40px -18px rgba(15, 23, 42, 0.18)'
            }}
          >
            <Box sx={{ mb: 2.25 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: '#475569', mb: 0.8, display: 'block' }}>
                USERNAME OR STORE ID
              </Typography>
              <TextField
                fullWidth
                autoComplete="username"
                placeholder="e.g. admin or AP20"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <User size={18} color="#0D9488" />
                      </InputAdornment>
                    )
                  }
                }}
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: '#475569', mb: 0.8, display: 'block' }}>
                PASSWORD
              </Typography>
              <TextField
                fullWidth
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock size={18} color="#0D9488" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((prev) => !prev)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
            </Box>

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.55, borderRadius: '12px', fontWeight: 800, fontSize: '1rem' }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
            </Button>
          </Box>

          <Box
            sx={{
              mt: 2.5,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 1.25
            }}
          >
            <Box
              sx={{
                p: 1.5,
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                bgcolor: '#FFFFFF'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.4 }}>
                <ShieldCheck size={15} color="#0D9488" />
                <Typography variant="caption" fontWeight={800} color="#0F172A">Admins</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: 'block' }}>
                Warehouse, stores, and request fulfillment
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1.5,
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                bgcolor: '#FFFFFF'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.4 }}>
                <ShieldCheck size={15} color="#7C3AED" />
                <Typography variant="caption" fontWeight={800} color="#0F172A">Executive</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: 'block' }}>
                First approval for assigned stores
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1.5,
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                bgcolor: '#FFFFFF'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.4 }}>
                <Store size={15} color="#2563EB" />
                <Typography variant="caption" fontWeight={800} color="#0F172A">Mini Store</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: 'block' }}>
                Branch inventory and medicine requisitions
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
