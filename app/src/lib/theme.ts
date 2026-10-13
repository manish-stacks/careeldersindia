// Care Elders India tokens — blue-green on cool clinical grey. Large type, big targets: many users are 50+.
export const C = {
  brand: '#0E5A8A',
  brandDark: '#0A4468',
  brandSoft: '#E8F1F8',
  brandLine: '#BCD6E8',
  canvas: '#F7F8FA',
  card: '#FFFFFF',
  ink: '#1F2328',
  inkSoft: '#3A4048',
  muted: '#5B6470',
  faint: '#8A929C',
  line: '#E3E6EA',
  lineStrong: '#CDD2D8',
  ok: '#1E7A4F',
  okSoft: '#E6F3EC',
  warn: '#B45309',
  warnSoft: '#FDF1E3',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  info: '#1D5E8C',
  infoSoft: '#E7F0F7',
};

export const F = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { sm: 8, md: 12, lg: 16, pill: 999 };

// Bottom tab bar tokens (content height excludes the system inset)
export const TAB = { height: 60, icon: 24, label: 12 };

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';
export const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: '#EEF0F3', fg: C.inkSoft },
  brand: { bg: C.brandSoft, fg: C.brandDark },
  ok: { bg: C.okSoft, fg: C.ok },
  warn: { bg: C.warnSoft, fg: C.warn },
  danger: { bg: C.dangerSoft, fg: C.danger },
  info: { bg: C.infoSoft, fg: C.info },
};
