import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Live integration tests run via vitest.integration.config.ts, not the default suite.
    exclude: [...configDefaults.exclude, "test/integration/**"],
    environment: "node",
  },
});
