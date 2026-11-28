/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // `primary` used to be Tailwind blue, a second accent next to the brand teal
        // (blue tabs and focus rings beside teal buttons). It now points at the brand
        // ramp so every accent in the app is the same colour; prefer `brand-*` in new code.
        primary: {
          50: '#E6FAF8',
          100: '#C5EFEC',
          300: '#82CBC7',
          400: '#5CBDB9',
          500: '#2BA3A0',
          600: '#1B7A78',
          700: '#155F5E',
          900: '#082E2E',
        },
        // GENSMILE brand palette — derived from logo.svg.
        // Source of truth: docs/00_Vision/branding/usage-guidelines.md
        brand: {
          50:  '#E6FAF8',  // lightest teal — surface, hover bg
          100: '#C5EFEC',  // very light — selected row
          200: '#A8D8D6',  // light — borders, badges
          300: '#82CBC7',  // dark-mode text and selected controls
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
        // Loaded from Google Fonts in index.html; all three cover Vietnamese.
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
