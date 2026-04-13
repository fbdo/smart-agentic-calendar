import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/index.ts"],
  project: ["src/**/*.ts"],
  ignoreBinaries: ["grype"],
  // LogTransport will be consumed in Task 6 (composition root)
  ignoreExportsUsedInFile: true,
};

export default config;
