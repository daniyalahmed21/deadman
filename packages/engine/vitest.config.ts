import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      // Excluded from the denominator: I/O boundaries that are integration/live-tested, not unit-tested.
      exclude: [
        "src/server.ts", // express + MCP HTTP wiring
        "src/backends/kind.ts", // real kubectl; verified against a live kind cluster, not unit tests
        "src/demo.ts", // demo orchestration
        "src/seed.ts", // demo seeding
      ],
    },
  },
});
