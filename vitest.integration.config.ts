import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    // Live network calls — give them room.
    testTimeout: 30_000,
  },
});
