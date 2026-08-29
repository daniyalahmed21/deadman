import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The operator console hosts TrueForge's chat UI with a custom approval card. TrueForge runs at
// :8790; we proxy its API so the console is same-origin in dev (no CORS headaches with SSE).
export default defineConfig({
  plugins: [react()],
  // The TrueForge UI SDK is a large tree of React packages. Dedupe React to a single copy and
  // pre-bundle the SDK (and its React-heavy sub-deps) as a unit, otherwise Vite's optimizer splits
  // React references across chunks and throws "Export 'import_react3' is not defined in module".
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@truefoundry/trueforge-ui",
      "@truefoundry/assistant-ui-runtime",
      "zustand",
      "zustand/shallow",
    ],
    // Prebundle with the automatic JSX runtime so React refs inside the SDK's optimized chunks
    // resolve consistently (fixes "Export 'import_react3' is not defined in module").
    esbuildOptions: { jsx: "automatic" },
  },
  server: {
    port: 5174,
    // In Docker the harness is another service (`trueforge`); locally it's on the host.
    proxy: {
      "/api": { target: process.env.TRUEFORGE_URL ?? "http://localhost:8790", changeOrigin: true },
    },
  },
});
