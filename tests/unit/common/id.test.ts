import { describe, it, expect } from "vitest";
import { generateId } from "../../../src/common/id.js";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateId", () => {
  it("returns a valid UUID v4", () => {
    const id = generateId();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it("returns unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
