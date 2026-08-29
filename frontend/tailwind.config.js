/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Legacy primary (blue) — kept for backward compatibility with existing screens.
        // New code should use `brand-*` for the GENSMILE teal palette.
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          900: '#1E3A8A',
        },
        // GENSMILE brand palette — derived from logo.svg.
        // Source of truth: docs/00_Vision/branding/usage-guidelines.md
        brand: {
          50:  '#E6FAF8',  // lightest teal — surface, hover bg
          100: '#C5EFEC',  // very light — selected row
          200: '#A8D8D6',  // light — borders, badges
          400: '#5CBDB9',  // accent
          500: '#2BA3A0',  // PRIMARY teal — buttons, links, icon (logotype)
          600: '#1B7A78',  // dark teal — wordmark text, hover
          700: '#155F5E',  // darker — pressed
          800: '#0F4746',  // deep — dark mode background
          900: '#082E2E',  // deepest
        },
        // Brand-warm accent (sparkle / motif on logo)
        accent: {
          DEFAULT: '#F4B860',
          dark:    '#D49644',
        },
        // Dark-mode surface tokens — used as `bg-surface-*` utilities
        surface: {
          0:   '#FFFFFF',
          50:  '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#0B1220',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
