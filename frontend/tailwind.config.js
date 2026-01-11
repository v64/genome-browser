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
        // Custom colors for magnitude scale
        'mag-low': '#22c55e',
        'mag-medium': '#eab308',
        'mag-high': '#ef4444',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
