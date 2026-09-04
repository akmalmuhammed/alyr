/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        alyr: {
          carbon: '#15171A',
          volt: '#B7F34A',
          mist: '#E9ECEF',
          concrete: '#A7ADB5',
          black: '#050505',
          paper: '#F6F7F3'
        }
      },
      fontFamily: {
        sans: ['Instrument Sans', 'Aptos', 'Segoe UI Variable', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Cascadia Mono', 'monospace']
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px'
      },
      transitionTimingFunction: {
        'alyr-out': 'cubic-bezier(.16, 1, .3, 1)',
        'alyr-in-out': 'cubic-bezier(.65, 0, .35, 1)'
      }
    }
  }
};
