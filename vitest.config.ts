import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    include: ["**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd())
    }
  }
});
