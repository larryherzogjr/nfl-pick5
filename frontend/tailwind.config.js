/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        field: { DEFAULT: '#174b38', dark: '#102e24' },
        gold: '#f1c86a',
        cream: '#f5f3ed',
        slate: {
          50: '#f5f3ed', 100: '#eef0e9', 200: '#d8ded6',
          300: '#b8c3b9', 400: '#7a897f', 500: '#58655d',
          600: '#46594d', 700: '#324b3d', 800: '#243d30', 900: '#172b22',
        },
      },
      fontFamily: {
        sans: ['Arial', 'sans-serif'],
        display: ['Impact', 'Arial Narrow', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
