import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/index.ts"],
  project: ["src/**/*.ts"],
  ignoreBinaries: ["grype"],
  ignoreExportsUsedInFile: true,
};

export default config;
