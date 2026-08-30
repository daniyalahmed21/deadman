import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Proxy the engine's read endpoints so the cockpit is same-origin in dev (no CORS).
// In Docker the engine is another service (`engine`); locally it's on the host. ENGINE_URL
// lets docker-compose point the proxy at http://engine:9000 without hardcoding either case.
const ENGINE = process.env.ENGINE_URL ?? "http://localhost:9000";

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/dashboard": ENGINE,
      "/healthz": ENGINE,
    },
  },
});
