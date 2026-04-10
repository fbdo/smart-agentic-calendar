import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/models/index.ts",
    "src/common/index.ts",
    "src/storage/index.ts",
    "src/engine/index.ts",
    "src/analytics/index.ts",
    "src/mcp/index.ts",
  ],
  project: ["src/**/*.ts"],
  ignoreDependencies: ["@types/*", "uuid"],
  ignoreBinaries: ["grype"],
};

export default config;
