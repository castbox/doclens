import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0B7285",
      dark: "#075C6B",
      light: "#26A0B4"
    },
    secondary: {
      main: "#1D4ED8",
      dark: "#1E40AF",
      light: "#3B82F6"
    },
    background: {
      default: "#F3F7FB",
      paper: "#FFFFFF"
    },
    divider: "#D7E4EE",
    text: {
      primary: "#0F172A",
      secondary: "#334155"
    },
    action: {
      hover: "#EAF2F8",
      selected: "#DDEAF4"
    }
  },
  shape: {
    borderRadius: 12
  },
  typography: {
    fontFamily: "var(--font-ibm-plex-sans)",
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.01em" },
    h3: { fontWeight: 600, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle2: { fontWeight: 600 },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.6 },
    button: { fontWeight: 600, textTransform: "none" }
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: false
      }
    },
    MuiCssBaseline: {
      styleOverrides: {
        ":root": {
          "--dl-bg-canvas": "#F3F7FB",
          "--dl-bg-surface": "#FFFFFF",
          "--dl-bg-subtle": "#EEF3F8",
          "--dl-border": "#D7E4EE",
          "--dl-text-primary": "#0F172A",
          "--dl-text-secondary": "#334155",
          "--dl-primary": "#0B7285",
          "--dl-primary-deep": "#075C6B",
          "--dl-accent": "#1D4ED8"
        },
        "*, *::before, *::after": {
          boxSizing: "border-box"
        },
        "::selection": {
          background: alpha("#0B7285", 0.2)
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #D7E4EE",
          boxShadow: "none",
          backgroundImage: "none"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease"
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: alpha("#FFFFFF", 0.9),
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            boxShadow: `0 0 0 3px ${alpha("#0B7285", 0.18)}`
          }
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
          "&.Mui-focusVisible": {
            outline: `2px solid ${alpha("#0B7285", 0.28)}`,
            outlineOffset: -2
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999
        },
        sizeSmall: {
          height: 22
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        size: "small"
      }
    }
  }
});
