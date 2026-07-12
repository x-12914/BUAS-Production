/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#111116',
          raised: '#16161c',
          overlay: '#1c1c24',
          border: '#2a2a35',
          hover: '#24242e',
        },
        content: {
          DEFAULT: '#e4e4e8',
          secondary: '#8e8e9a',
          muted: '#505060',
        },
        accent: {
          DEFAULT: '#5b7bf5',
          hover: '#4a6ae4',
          muted: 'rgba(91, 123, 245, 0.15)',
        },
        success: {
          DEFAULT: '#34d399',
          muted: 'rgba(52, 211, 153, 0.15)',
        },
        warning: {
          DEFAULT: '#fbbf24',
          muted: 'rgba(251, 191, 36, 0.15)',
        },
        danger: {
          DEFAULT: '#f87171',
          muted: 'rgba(248, 113, 113, 0.15)',
        },
        info: {
          DEFAULT: '#60a5fa',
          muted: 'rgba(96, 165, 250, 0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        glass: '12px',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
