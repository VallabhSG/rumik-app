export const Colors = {
  bg: "#f5f2ed",
  surface: "#ede8e0",
  muted: "#d8d0c4",
  accent: "#3d5a6e",
  accentDeep: "#2d4a5e",
  text: "#18202a",
  textSecondary: "#8a8070",
  textMuted: "#b0a898",
  border: "#e8e2d8",
  white: "#fdfcfa",
} as const;

export const Typography = {
  display: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: -1,
  },
  headline: {
    fontSize: 20,
    fontWeight: 800,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
  },
  body: {
    fontSize: 13,
    fontWeight: 600,
  },
  bodySecondary: {
    fontSize: 13,
    fontWeight: 400,
  },
  label: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  caption: {
    fontSize: 10,
    fontWeight: 400,
  },
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
} as const;
