/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // YONO SBI & Corporate Banking Deep Tones
        sbi: {
          blue: '#002B49',
          navy: '#0C1A30',
          dark: '#07101E',
          accent: '#1A73E8',
          light: '#EBF3FC',
          purple: '#6B1F8E',
          cyan: '#00A3E0',
          gold: '#C59B27',
        },
        navy: {
          50: '#f0f5fa',
          100: '#dce7f3',
          200: '#bed2e7',
          300: '#91b4d6',
          400: '#5e92c2',
          500: '#3c75ae',
          600: '#2c5d91',
          700: '#244b76',
          800: '#1e3a5f',
          900: '#0b2545',
          950: '#07162c',
        },
      },
      boxShadow: {
        'banking': '0 4px 20px -2px rgba(12, 26, 48, 0.08), 0 2px 6px -1px rgba(12, 26, 48, 0.04)',
        'banking-hover': '0 12px 30px -4px rgba(12, 26, 48, 0.12), 0 4px 12px -2px rgba(12, 26, 48, 0.06)',
        'card-glow': '0 0 0 1px rgba(226, 232, 240, 0.8), 0 8px 24px -4px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};
