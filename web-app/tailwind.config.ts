import type { Config } from 'tailwindcss';

// Care Elders India tokens: blue-green brand on a cool clinical grey. No purple anywhere.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0E5A8A', dark: '#0A4468', soft: '#E8F1F8', line: '#BCD6E8' },
        canvas: '#F7F8FA',
        paper: '#FFFFFF',
        sand: '#F1F6F9',
        rule: '#DCE5EB',
        navy: { DEFAULT: '#0B4F7C', dark: '#083A5C' },
        leaf: { DEFAULT: '#2E8B57', soft: '#E4F0E8' },
        saffron: { DEFAULT: '#F08A24', dark: '#D6740F' },
        ink: { DEFAULT: '#1F2328', soft: '#3A4048', muted: '#5B6470', faint: '#8A929C' },
        line: { DEFAULT: '#E3E6EA', strong: '#CDD2D8' },
        ok: { DEFAULT: '#1E7A4F', soft: '#E6F3EC' },
        warn: { DEFAULT: '#B45309', soft: '#FDF1E3' },
        danger: { DEFAULT: '#B42318', soft: '#FDECEA' },
        info: { DEFAULT: '#1D5E8C', soft: '#E7F0F7' },
      },
      fontFamily: { sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      borderRadius: { panel: '14px' },
      boxShadow: { pop: '0 12px 32px -12px rgba(31,35,40,0.28)' },
    },
  },
  plugins: [],
};
export default config;
