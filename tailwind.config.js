import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          50: '#F2EFFF',
          100: '#E4DEFF',
          200: '#C9BEFF',
          300: '#A78BFA',
          400: '#8B6DFF',
          500: '#7C5CFF',
          600: '#6344E8',
          700: '#4C34B8',
        },
        accent: {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
        },
        ink: {
          900: '#0B0D12',
          800: '#11141C',
          700: '#171B26',
          600: '#1E2331',
          500: '#272D3D',
        },
        muted: {
          100: '#E6E9F2',
          200: '#9AA3B2',
          300: '#6B7385',
        },
        ok: '#34D399',
        warn: '#FBBF24',
        danger: '#F87171',
        info: '#38BDF8',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,.35), 0 12px 40px -12px rgba(124,92,255,.55)',
        panel: '0 18px 50px -24px rgba(0,0,0,.85)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(120deg,#7C5CFF 0%,#A78BFA 45%,#22D3EE 100%)',
        'panel-sheen': 'linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 42%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px) scale(.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.55' },
        },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'fade-in-fast': 'fade-in-fast .18s ease-out both',
        'slide-up': 'slide-up .22s cubic-bezier(.16,1,.3,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};
