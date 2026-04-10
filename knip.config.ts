import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/models/index.ts", "src/common/index.ts", "src/storage/database.ts"],
  project: ["src/**/*.ts"],
  ignoreDependencies: ["@types/*", "uuid"],
  ignoreBinaries: ["grype"],
};

export default config;
