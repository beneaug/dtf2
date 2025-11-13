/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
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
        "thermal-rise":
          "thermal-rise 2.4s cubic-bezier(0.22,0.61,0.21,1) forwards",
      },
      backgroundImage: {
        "radial-hero":
          "radial-gradient(circle_at_50%_-20%, #111827 0, #020308 55%)",
        "thermal-blob":
          "radial-gradient(circle at 50% 15%, #fff4b3 0, #ffe066 10%, #ffba08 22%, #ff7b00 35%, #ff006e 50%, #d40078 63%, #7b2cbf 78%, #240046 100%)",
      },
    },
  },
  plugins: [],
};

