import { defineConfig } from "vitest/config";
import { vitestSetupFilePath } from "@hirosystems/clarinet-sdk/vitest";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [vitestSetupFilePath],
    environmentMatchGlobs: [["tests/**/*.test.ts", "clarinet"]],
  },
});