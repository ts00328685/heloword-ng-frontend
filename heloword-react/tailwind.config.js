/** @type {import('tailwindcss').Config} */

// ── 和 palette ──────────────────────────────────────────────────────────────
// Semantic tokens (paper / surface / ink / line / ai) are CSS variables defined
// in index.css so light & dark swap in one place. New code should use ONLY these.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// Muted traditional hues. Legacy Tailwind colour names (blue, purple, pink…) are
// collapsed onto these four so un-migrated screens calm down immediately.
const ai = { // 藍 indigo — the single accent
  50: '#F1F4F8', 100: '#DFE6EE', 200: '#BFCCDB', 300: '#98AAC0', 400: '#7088A5',
  500: '#4C6889', 600: '#3B5576', 700: '#2E4A6B', 800: '#233850', 900: '#192839', 950: '#0F1824',
};
const beni = { // 紅 muted red — errors, destructive, "wrong"
  50: '#FAF2F0', 100: '#F3DFDB', 200: '#E6C0B9', 300: '#D49C92', 400: '#BF776B',
  500: '#A8584B', 600: '#8F473C', 700: '#743A31', 800: '#5A2E27', 900: '#42221D', 950: '#2A1613',
};
const kincha = { // 金茶 ochre — warnings, streaks
  50: '#FAF6EC', 100: '#F2E8CF', 200: '#E5D2A3', 300: '#D3B776', 400: '#BF9C52',
  500: '#A3833C', 600: '#866B31', 700: '#6A5428', 800: '#504020', 900: '#3A2F18', 950: '#241D10',
};
const matcha = { // 抹茶 green — success, "correct"
  50: '#F2F5F0', 100: '#E2E9DE', 200: '#C4D2BD', 300: '#A2B698', 400: '#809876',
  500: '#637C59', 600: '#506548', 700: '#40513A', 800: '#323F2E', 900: '#252F22', 950: '#181E16',
};

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.25s ease-out',
      },
      colors: {
        paper: token('paper'),
        surface: token('surface'),
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
          faint: token('ink-faint'),
        },
        line: token('line'),
        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft'),
        },
        // Semantic states — the only other hues allowed, always muted
        danger:  { DEFAULT: token('danger'),  soft: token('danger-soft') },  // 紅
        success: { DEFAULT: token('success'), soft: token('success-soft') }, // 抹茶
        warn:    { DEFAULT: token('warn'),    soft: token('warn-soft') },    // 金茶
        primary: { DEFAULT: ai[700], dark: ai[800], light: ai[300] },

        ai, beni, kincha, matcha,
        // Legacy names → muted hues (transitional; remove once screens are migrated)
        blue: ai, indigo: ai, sky: ai, cyan: ai, violet: ai, purple: ai, fuchsia: ai,
        red: beni, rose: beni, pink: beni,
        orange: kincha, amber: kincha, yellow: kincha,
        green: matcha, emerald: matcha, teal: matcha, lime: matcha,

        // Warm 和紙 neutrals (gray-50 = paper, gray-900 = dark paper)
        gray: {
          50:  '#F7F5F0',
          100: '#EFECE6',
          200: '#E4E0D8',
          300: '#CFCAC0',
          400: '#A39E94',
          500: '#78736A',
          600: '#5A564F',
          700: '#3F3C37',
          750: '#2E2C29',
          800: '#1C1B19',
          900: '#141413',
          950: '#0C0C0B',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans TC"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif TC"', '"Noto Serif JP"', 'Georgia', 'serif'],
      },
      // Flat by default: hairlines do the separating, shadows only lift overlays
      boxShadow: {
        sm: 'none',
        DEFAULT: '0 1px 2px rgb(0 0 0 / 0.14)', // toggle knobs and other small raised bits
        md: '0 1px 2px rgb(0 0 0 / 0.04)',
        lg: '0 12px 32px -12px rgb(0 0 0 / 0.14)',
        xl: '0 16px 40px -12px rgb(0 0 0 / 0.16)',
        '2xl': '0 20px 48px -12px rgb(0 0 0 / 0.18)',
      },
      // Tighter corners: 2xl/3xl bubbles become quiet 6–12px radii
      borderRadius: {
        lg: '6px',
        xl: '6px',
        '2xl': '8px',
        '3xl': '12px',
      },
      // CJK fonts ship 400/500 only; heavier weights get faux-bolded and look loud
      fontWeight: {
        semibold: '500',
        bold: '600',
      },
      letterSpacing: {
        label: '0.14em',
      },
    },
  },
  plugins: [],
}
