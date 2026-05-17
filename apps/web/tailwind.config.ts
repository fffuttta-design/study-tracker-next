import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f0ff",
          100: "#e0e0fe",
          500: "#6666dd",
          600: "#5555cc",
          700: "#4444bb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
