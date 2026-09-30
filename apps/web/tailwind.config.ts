import type { Config } from "tailwindcss";

// Identidade: azul/ciano da logo UDV (#009FD1) + neutros.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecf9fd", 100: "#d0f0fa", 200: "#a3e1f4", 300: "#66cdeb", 400: "#2db5de",
          500: "#009fd1", 600: "#0384ae", 700: "#086a8b", 800: "#0d566f", 900: "#0f475c",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
