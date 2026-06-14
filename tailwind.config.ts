import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Coverage status palette (within / approaching / over).
        coverage: {
          within: "#16a34a",
          approaching: "#d97706",
          over: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
