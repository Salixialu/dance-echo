/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        space: {
          void: '#09090b',
          surface: 'rgba(24, 24, 27, 0.75)',
          solid: '#18181b',
          elevated: '#27272a',
          panel: 'rgba(24, 24, 27, 0.75)',
          overlay: 'rgba(9, 9, 11, 0.85)',
        },
        hairline: {
          DEFAULT: 'rgba(255, 255, 255, 0.07)',
          subtle: 'rgba(255, 255, 255, 0.04)',
          hover: 'rgba(255, 255, 255, 0.15)',
        },
        accent: {
          cyan: {
            DEFAULT: '#22d3ee',
            subtle: 'rgba(34, 211, 238, 0.12)',
            border: 'rgba(34, 211, 238, 0.30)',
          },
          purple: {
            DEFAULT: '#c084fc',
            subtle: 'rgba(192, 132, 252, 0.12)',
            border: 'rgba(192, 132, 252, 0.30)',
          },
          emerald: {
            DEFAULT: '#34d399',
            subtle: 'rgba(52, 211, 153, 0.12)',
            border: 'rgba(52, 211, 153, 0.30)',
          },
          amber: {
            DEFAULT: '#fbbf24',
            subtle: 'rgba(251, 191, 36, 0.12)',
            border: 'rgba(251, 191, 36, 0.30)',
          },
          silver: {
            DEFAULT: '#e4e4e7',
            subtle: 'rgba(228, 228, 231, 0.08)',
            border: 'rgba(228, 228, 231, 0.16)',
          },
        },
        brand: {
          50: '#fdf4ff',
          100: '#fae8ff',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
        }
      },
      borderColor: {
        hairline: 'rgba(255, 255, 255, 0.07)',
        'hairline-subtle': 'rgba(255, 255, 255, 0.04)',
        'hairline-hover': 'rgba(255, 255, 255, 0.15)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"JetBrains Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        'hairline': '0 0 0 1px rgba(255, 255, 255, 0.07)',
        'glow-cyan': '0 0 20px rgba(34, 211, 238, 0.20)',
        'glow-purple': '0 0 20px rgba(192, 132, 252, 0.20)',
        'glow-emerald': '0 0 20px rgba(52, 211, 153, 0.20)',
        'glow-amber': '0 0 20px rgba(251, 191, 36, 0.20)',
      }
    },
  },
  plugins: [],
}
