import type { Config } from 'tailwindcss';

// ParentCare tokens: warm red brand on a cool clinical grey. No purple anywhere.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#C8352E', dark: '#A42A24', soft: '#FBECEA', line: '#F2C9C5' },
        canvas: '#F7F8FA',
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
