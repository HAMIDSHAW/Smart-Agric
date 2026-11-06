/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Primary palette (redesign prompt) ──────────────────
        primary: {
          DEFAULT: '#14532D',
          hover:   '#0F3D21',
          light:   '#2E7D32',
        },
        accent: {
          DEFAULT: '#4CAF50',
          light:   '#81C784',
        },
        highlight: {
          DEFAULT: '#F59E0B',
          light:   '#FCD34D',
        },
        techblue: {
          DEFAULT: '#0EA5E9',
          light:   '#38BDF8',
        },

        // ── Backgrounds ────────────────────────────────────────
        page:    '#FAFAF7',
        card:    '#FFFFFF',
        alt:     '#F3F7F1',
        dark:    '#0F172A',

        // ── Text ───────────────────────────────────────────────
        ink:     '#111827',
        body:    '#4B5563',
        muted:   '#6B7280',

        // ── Legacy soil/leaf/bark/sand/gold tokens, remapped onto
        // the new palette so every existing className in the app
        // (dashboard, modules, etc.) renders consistently with the
        // redesigned pages without having to touch each file's classes.
        soil: {
          DEFAULT: '#2E7D32',
          dark:    '#14532D',
          light:   '#4CAF50',
          pale:    '#F0FDF4',
        },
        leaf: {
          DEFAULT: '#14532D',
          light:   '#4CAF50',
          pale:    '#F0FDF4',
        },
        bark:  '#0F172A',
        sand: {
          DEFAULT: '#E5E7EB',
          light:   '#FAFAF7',
        },
        gold: {
          DEFAULT: '#F59E0B',
          light:   '#FCD34D',
        },
        sky: {
          DEFAULT: '#0EA5E9',
          light:   '#38BDF8',
        },
        agri: {
          dark:   '#0F172A',
          muted:  '#6B7280',
          white:  '#FAFAF7',
          border: '#E5E7EB',
        },
      },

      fontFamily: {
        heading: ['Poppins', 'sans-serif'],
        sans:    ['Inter', 'DM Sans', 'sans-serif'],
        serif:   ['Poppins', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },

      fontSize: {
        'h1':   ['4rem',    { lineHeight: '1.08', fontWeight: '800' }],
        'h2':   ['3rem',    { lineHeight: '1.15', fontWeight: '700' }],
        'h3':   ['2.25rem', { lineHeight: '1.2',  fontWeight: '600' }],
        'h4':   ['1.75rem', { lineHeight: '1.3',  fontWeight: '600' }],
        'body': ['1rem',    { lineHeight: '1.7' }],
        'sm':   ['0.9rem',  { lineHeight: '1.6' }],
        'xs':   ['0.8rem',  { lineHeight: '1.5' }],
        'cap':  ['0.75rem', { lineHeight: '1.4' }],
      },

      borderRadius: {
        card: '16px',
        btn:  '10px',
        pill: '99px',
      },

      boxShadow: {
        card:    '0 2px 8px rgba(0,0,0,0.05)',
        'card-hover': '0 10px 32px rgba(0,0,0,0.09)',
        agri:    '0 2px 8px rgba(0,0,0,0.05)',
        'agri-lg':'0 8px 32px rgba(0,0,0,0.1)',
        primary: '0 4px 20px rgba(20,83,45,0.3)',
        'primary-lg': '0 8px 40px rgba(20,83,45,0.4)',
        highlight: '0 4px 20px rgba(245,158,11,0.35)',
      },

      spacing: {
        section: '6rem',
        'section-sm': '4rem',
      },

      animation: {
        'fade-in':    'fadeIn 0.35s ease-out both',
        'slide-up':   'slideUp 0.4s ease-out both',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        'risk-pulse': 'riskPulse 2.5s ease-in-out infinite',
        'spin-slow':  'spin 1.5s linear infinite',
      },

      keyframes: {
        fadeIn:    { from: { opacity: 0, transform: 'translateY(8px)' },  to: { opacity: 1, transform: 'translateY(0)' } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSlow: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
        riskPulse: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(185,28,28,0.3)' }, '50%': { boxShadow: '0 0 0 8px rgba(185,28,28,0)' } },
      },
    },
  },
  plugins: [],
}
