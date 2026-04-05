/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: '#1a1a2e',
          light: '#25253a',
          border: '#363654',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
        }
      }
    },
  },
  plugins: [],
}
