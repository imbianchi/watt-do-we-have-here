/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: '#0a0a0f',
        card: '#12121a',
        'card-hover': '#181822',
        line: '#1e1e2e',
        primary: {
          DEFAULT: '#6366f1',
          dim: '#4f46e5',
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite linear',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-700px 0' },
          '100%': { backgroundPosition: '700px 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(16,185,129,0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(16,185,129,0.65)' },
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
