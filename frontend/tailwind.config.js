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
        dark: {
          950: '#0b0b0b',
          900: '#101010',
          850: '#151515',
          800: '#1a1a1a',
          700: '#252525',
          600: '#333333',
        },
        brand: {
          red: '#e50914',
          'red-hover': '#b80710',
          'red-light': '#ff2a34',
          'red-dark': '#880000',
        }
      }
    },
  },
  plugins: [],
}

