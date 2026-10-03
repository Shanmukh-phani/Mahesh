import { createTheme } from '@mui/material/styles';

const BRANDS = {
  teal: {
    main: '#0D9488',
    light: '#2DD4BF',
    dark: '#0F766E',
    darker: '#115E59',
    soft: '#F0FDFA',
    soft2: '#CCFBF1',
    border: '#99F6E4',
    ring: 'rgba(13, 148, 136, 0.12)',
    shadow: 'rgba(13, 148, 136, 0.3)'
  },
  orange: {
    main: '#EA580C',
    light: '#FB923C',
    dark: '#C2410C',
    darker: '#9A3412',
    soft: '#FFF7ED',
    soft2: '#FFEDD5',
    border: '#FED7AA',
    ring: 'rgba(234, 88, 12, 0.14)',
    shadow: 'rgba(234, 88, 12, 0.32)'
  }
};

const BLUE_SECONDARY = {
  main: '#2563EB',
  light: '#60A5FA',
  dark: '#1D4ED8',
  darker: '#1E40AF',
  shadow: 'rgba(37, 99, 235, 0.3)'
};

const createAppTheme = (b, secondary = BLUE_SECONDARY, { flat = false } = {}) => createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: b.main,
      light: b.light,
      dark: b.dark,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: secondary.main,
      light: secondary.light,
      dark: secondary.dark,
      contrastText: '#FFFFFF',
    },
    brand: { ...b },
    background: {
      default: '#F8FAFC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
    },
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
    h1: { fontWeight: 800 },
    h2: { fontWeight: 800 },
    h3: { fontWeight: 800 },
    h4: { fontWeight: 800 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 700 },
    subtitle2: { fontWeight: 600 },
    body1: { fontWeight: 400 },
    body2: { fontWeight: 400 },
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          padding: '8px 18px',
          boxShadow: 'none',
          fontWeight: 800,
          transition: 'all 0.2s ease-in-out',
        },
        containedPrimary: flat ? {
          background: b.main,
          boxShadow: 'none',
          '&:hover': { background: b.dark, boxShadow: 'none' },
        } : {
          background: `linear-gradient(135deg, ${b.main} 0%, ${b.dark} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${b.dark} 0%, ${b.darker} 100%)`,
            boxShadow: `0 4px 14px ${b.shadow}`,
          },
        },
        containedSecondary: flat ? {
          background: secondary.main,
          boxShadow: 'none',
          '&:hover': { background: secondary.dark, boxShadow: 'none' },
        } : {
          background: `linear-gradient(135deg, ${secondary.main} 0%, ${secondary.dark} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${secondary.dark} 0%, ${secondary.darker} 100%)`,
            boxShadow: `0 4px 14px ${secondary.shadow}`,
          },
        },
        outlined: {
          borderColor: '#CBD5E1',
          color: '#334155',
          '&:hover': {
            borderColor: b.main,
            bgcolor: b.soft,
            color: b.dark,
          },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 800,
          fontSize: '0.68rem',
          minWidth: 18,
          height: 18,
          padding: '0 5px',
          border: '2px solid #FFFFFF',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 16px 40px -12px rgba(15, 23, 42, 0.22)',
          marginTop: 8,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 18px 44px -14px rgba(15, 23, 42, 0.24)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          fontSize: '0.88rem',
          borderRadius: '10px',
          margin: '2px 6px',
          '&:hover': {
            backgroundColor: b.soft,
            color: b.dark,
          },
          '&.Mui-selected': {
            backgroundColor: b.soft2,
            color: b.dark,
            '&:hover': {
              backgroundColor: b.border,
            },
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'medium',
      },
    },
    MuiSelect: {
      defaultProps: {
        size: 'medium',
        MenuProps: {
          PaperProps: {
            sx: {
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 16px 40px -12px rgba(15, 23, 42, 0.22)',
              mt: 1,
            },
          },
        },
      },
      styleOverrides: {
        select: {
          padding: '14px 16px',
          fontWeight: 700,
          color: '#0F172A',
        },
        icon: {
          color: b.dark,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#64748B',
          transform: 'translate(14px, 14px) scale(1)',
          '&.MuiInputLabel-shrink': {
            transform: 'translate(14px, -9px) scale(0.85)',
            fontWeight: 700,
            color: '#0F172A',
            backgroundColor: '#FFFFFF',
            padding: '0 4px',
            borderRadius: '4px',
          },
          '&.Mui-focused': {
            color: b.main,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          backgroundColor: '#F8FAFC',
          transition: 'all 0.2s ease-in-out',
          '& fieldset': {
            borderColor: '#E2E8F0',
            borderWidth: '1px',
            transition: 'border-color 0.2s ease-in-out',
          },
          '&:hover': {
            backgroundColor: '#F1F5F9',
          },
          '&:hover fieldset': {
            borderColor: '#CBD5E1',
          },
          '&.Mui-focused': {
            backgroundColor: '#FFFFFF',
            boxShadow: `0 0 0 4px ${b.ring}`,
          },
          '&.Mui-focused fieldset': {
            borderColor: b.main,
            borderWidth: '1.5px',
          },
          '&.MuiInputBase-sizeSmall': {
            borderRadius: '12px',
            '& .MuiSelect-select': {
              padding: '10px 14px',
              fontWeight: 700,
            },
          },
        },
        input: {
          padding: '14.5px 16px',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#0F172A',
          '&::placeholder': {
            color: '#94A3B8',
            opacity: 1,
            fontWeight: 500,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 800,
          backgroundColor: '#F8FAFC',
          color: '#475569',
          borderBottom: '1px solid #E2E8F0',
        },
        body: {
          borderBottom: '1px solid #F1F5F9',
        },
      },
    },
  },
});

const theme = createAppTheme(BRANDS.teal);

export const storeTheme = createAppTheme(BRANDS.orange, BRANDS.orange, { flat: true });

export default theme;
