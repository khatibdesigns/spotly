// Spotly — design tokens (ported from the Claude Design handoff).
// oklch values from the design were converted to sRGB hex for React Native.
import { Platform, ViewStyle } from 'react-native';

export const C = {
  coral: '#fa7959', // primary CTA — discovery register
  coralDk: '#c94c2d', // hover / pressed
  coralLt: '#ffdfcd', // tint backgrounds
  sage: '#398b77', // memory / map accent
  sageLt: '#d4f3ea',
  sun: '#eebc4a', // age 0–3 / sunshine
  sky: '#54aad1', // water / age 4–7
  plum: '#9c5eaa', // age 8–12 / arts
  ink: '#1f1915', // primary text
  ink2: '#47413c', // secondary text
  ink3: '#7f7974', // tertiary / icons
  line: '#dedad5', // hairlines
  bg: '#fcfaf6', // app background — warm paper
  surface: '#ffffff',
  surface2: '#f7f3ee', // cards on bg
  premium: '#485996', // Plus / indigo
  warn: '#eb7c33',
  good: '#4a9a5e',
  white: '#ffffff',
};

// Striped placeholder gradient pairs [a, b]
export const PLACEHOLDER: Record<string, [string, string]> = {
  warm: ['#f2c6ae', '#efac8d'],
  sage: ['#b7dacf', '#8fc4b5'],
  sky: ['#add9e8', '#86c1d9'],
  sun: ['#f7dba1', '#e8be62'],
  plum: ['#d9b6e1', '#c796d2'],
  paper: ['#f1eae3', '#eadfd3'],
  ink: ['#38322d', '#29231e'],
};

// Font family names (loaded via @expo-google-fonts in App.tsx).
// mono falls back to a platform monospace — used only for small eyebrow labels.
export const F = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  serif: 'Fraunces_500Medium',
  serifReg: 'Fraunces_400Regular',
  serifSemi: 'Fraunces_600SemiBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};

export const R = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };

// Soft, warm shadows (RN approximations of the web box-shadows).
export const SH: Record<string, ViewStyle> = {
  card: {
    shadowColor: '#281e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  pop: {
    shadowColor: '#281e14',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 34,
    elevation: 12,
  },
  pill: {
    shadowColor: '#281e14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  cta: {
    shadowColor: 'rgba(204,90,50,1)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
};
