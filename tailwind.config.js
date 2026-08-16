/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
        display: ['"Orbitron"', 'sans-serif'],
        ui: ['"Rajdhani"', 'sans-serif'],
      },
      colors: {
        studio: {
          black: '#080810',
          void: '#0d0d18',
          deep: '#111120',
          panel: '#161626',
          surface: '#1c1c30',
          border: '#252540',
          muted: '#2a2a48',
          cyan: '#00e5ff',
          purple: '#b44fff',
          green: '#00ff9d',
          red: '#ff2d55',
          orange: '#ff9500',
          yellow: '#ffe600',
          text: '#e0e0f0',
          dim: '#888899',
        },
      },
      boxShadow: {
        cyan: '0 0 12px rgba(0,229,255,0.4)',
        purple: '0 0 12px rgba(180,79,255,0.4)',
        green: '0 0 12px rgba(0,255,157,0.4)',
        red: '0 0 12px rgba(255,45,85,0.4)',
        glow: '0 0 30px rgba(0,229,255,0.15)',
      },
    },
  },
  plugins: [],
}
