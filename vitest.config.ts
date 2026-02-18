import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".cache"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
