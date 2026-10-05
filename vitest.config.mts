import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.spec.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.spec.ts"],
          globalSetup: ["test/integration/support/globalSetup.ts"],
          fileParallelism: false,
          sequence: {concurrent: false},
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
