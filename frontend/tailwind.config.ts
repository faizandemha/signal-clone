import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        signal: {
          blue: "#3a76f0",
          "blue-dark": "#2f5ec4",
          bg: "#ffffff",
          "bg-dark": "#0f1113",
          sidebar: "#f6f6f6",
          "sidebar-dark": "#17181a",
          panel: "#fbfbfb",
          "panel-dark": "#1c1e21",
          border: "#e3e3e3",
          "border-dark": "#2a2c2f",
          bubbleOut: "#3a76f0",
          bubbleIn: "#eeeeee",
          "bubbleIn-dark": "#25272b",
          textMuted: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
