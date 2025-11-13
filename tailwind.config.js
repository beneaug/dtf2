// tailwind.config.js (or .ts)
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "thermal-rise": {
          "0%": {
            opacity: "0",
            transform: "translate(-50%, 60vh)",
          },
          "40%": {
            opacity: "1",
            transform: "translate(-50%, 10vh)",
          },
          "70%": {
            transform: "translate(-50%, 0)",
          },
          "100%": {
            opacity: "1",
            transform: "translate(-50%, 5vh)",
          },
        },
      },
      animation: {
        "thermal-rise": "thermal-rise 2.4s cubic-bezier(0.22,0.61,0.21,1) forwards",
      },
      backgroundImage: {
        "radial-hero":
          "radial-gradient(circle at 50% -20%, #111827 0, #020308 55%)",
      },
    },
  },
  plugins: [],
};

