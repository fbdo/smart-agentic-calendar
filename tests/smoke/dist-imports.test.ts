/**
 * Smoke test that imports compiled dist/ output using Node.js dynamic import.
 *
 * Vitest transforms imports and papers over CJS/ESM interop differences.
 * This test catches cases where a named import works under vitest but fails
 * at runtime — e.g. the rrulestr named export that only exists on default.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const distIndex = resolve(__dirname, "../../dist/index.js");

describe("dist/ smoke tests", () => {
  it("dist/index.js exists (build must run first)", () => {
    expect(existsSync(distIndex)).toBe(true);
  });

  it("dist/ modules load and recurrence (rrulestr) works at runtime", () => {
    // Run a Node.js subprocess that imports the built output.
    // This exercises the real ESM resolution — no vitest transforms.
    const result = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
        import { createApp } from ${JSON.stringify("file://" + distIndex)};
        const app = createApp(":memory:");

        // Configure availability so recurrence instances can be generated
        app.configTools.setAvailability({
          windows: [{ day: 1, start_time: "09:00", end_time: "17:00" }],
        });

        // Create a recurring task — this exercises the rrulestr import
        // in recurrence-manager.js which broke at runtime with ESM
        const result = app.taskTools.createTask({
          title: "Smoke test recurring",
          estimated_duration: 30,
          priority: "P3",
          recurrence_rule: "FREQ=WEEKLY;COUNT=2",
        });

        if (!result.template_id) {
          throw new Error("Expected recurring task result with template_id, got: " + JSON.stringify(result));
        }
        console.log("OK");
        `,
      ],
      { encoding: "utf-8", timeout: 10_000 },
    );

    expect(result.trim()).toContain("OK");
  });
});
