/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // === LAYER RULES (from component-dependency.md) ===

    // common/ → (nothing internal)
    {
      name: "common-cannot-depend-on-anything",
      comment: "common/ is a leaf layer — it must not import from any other src layer",
      severity: "error",
      from: { path: "^src/common/" },
      to: { path: "^src/(models|storage|engine|analytics|mcp)/" },
    },

    // models/ → common/ only
    {
      name: "models-cannot-depend-on-upper-layers",
      comment: "models/ may only depend on common/ — not storage, engine, mcp, or analytics",
      severity: "error",
      from: { path: "^src/models/" },
      to: { path: "^src/(storage|engine|mcp|analytics)/" },
    },

    // storage/ → models/, common/ only
    {
      name: "storage-cannot-depend-on-upper-layers",
      comment: "storage/ may only depend on models/ and common/ — not engine, mcp, or analytics",
      severity: "error",
      from: { path: "^src/storage/" },
      to: { path: "^src/(engine|mcp|analytics)/" },
    },

    // engine/ → storage/, models/, common/ only
    {
      name: "engine-cannot-depend-on-mcp",
      comment: "engine/ must not depend on the MCP presentation layer",
      severity: "error",
      from: { path: "^src/engine/" },
      to: { path: "^src/mcp/" },
    },

    // analytics/ → storage/, models/, common/ only
    {
      name: "analytics-cannot-depend-on-mcp-or-engine",
      comment: "analytics/ must not depend on mcp/ or engine/",
      severity: "error",
      from: { path: "^src/analytics/" },
      to: { path: "^src/(mcp|engine)/" },
    },

    // === GENERAL RULES ===

    // No circular dependencies anywhere
    {
      name: "no-circular",
      comment: "No circular dependencies allowed (matches architecture: no cycles in DI graph)",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    // No orphan modules (files not reachable from entry points)
    {
      name: "no-orphans",
      comment: "All modules should be reachable from an entry point",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+",       // dotfiles
          "\\.test\\.ts$",       // test files
          "\\.spec\\.ts$",       // spec files
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      dot: {
        theme: {
          graph: { rankdir: "TB" },
        },
      },
    },
  },
};
