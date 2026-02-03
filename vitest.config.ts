import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".cache"],
    environment: "node",
  },
});
