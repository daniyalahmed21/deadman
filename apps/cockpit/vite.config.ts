import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Proxy the engine's read endpoints so the cockpit is same-origin in dev (no CORS).
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/dashboard": "http://localhost:9000",
      "/healthz": "http://localhost:9000",
    },
  },
});
