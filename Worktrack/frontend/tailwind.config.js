/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3a7bd5',
        dark:    '#1e2a3a',
        sidebar: '#2d3f52',
      }
    }
  },
  plugins: [],
}
