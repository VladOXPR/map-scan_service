/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        cuub: {
          bg: '#000000',
          surface: '#1C1C1E',
          elevated: '#2C2C2E',
          primary: '#3890F0',
          text: '#FFFFFF',
          muted: '#A1A1AA',
          border: 'rgba(255,255,255,0.12)',
          danger: '#FF453A',
          success: '#30D158',
        },
      },
      borderRadius: {
        sheet: '28px',
        button: '14px',
        card: '20px',
      },
    },
  },
  plugins: [],
};
