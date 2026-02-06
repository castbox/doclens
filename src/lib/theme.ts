import { createTheme } from "@mui/material/styles";

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
      default: "#F4F8FB",
      paper: "#FFFFFF"
    },
    text: {
      primary: "#0F172A",
      secondary: "#334155"
    }
  },
  shape: {
    borderRadius: 10
  },
  typography: {
    fontFamily: "var(--font-ibm-plex-sans)",
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.01em" },
    h3: { fontWeight: 600, letterSpacing: "-0.01em" },
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
        "*, *::before, *::after": {
          boxSizing: "border-box"
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #D7E4EE"
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
