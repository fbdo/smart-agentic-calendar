import { describe, it, expect } from "vitest";
import { createApp, getDbPath } from "../../../src/index.js";

describe("Composition root", () => {
  it("createApp builds all components without error using in-memory database", () => {
    const app = createApp(":memory:");
    expect(app).toBeDefined();
    expect(app.server).toBeDefined();
    expect(app.database).toBeDefined();
  });

  it("DI wiring order: all dependencies satisfied", () => {
    // If DI wiring is incorrect (wrong order or missing deps), createApp throws
    expect(() => createApp(":memory:")).not.toThrow();
  });

  it("getDbPath returns default ./calendar.db", () => {
    const original = process.env.CALENDAR_DB_PATH;
    delete process.env.CALENDAR_DB_PATH;
    try {
      expect(getDbPath()).toBe("./calendar.db");
    } finally {
      if (original !== undefined) {
        process.env.CALENDAR_DB_PATH = original;
      }
    }
  });

  it("environment variable CALENDAR_DB_PATH overrides default", () => {
    const original = process.env.CALENDAR_DB_PATH;
    const testDbPath = process.env.HOME + "/.calendar-test/override.db"; // avoid publicly-writable /tmp
    process.env.CALENDAR_DB_PATH = testDbPath;
    try {
      expect(getDbPath()).toBe(testDbPath);
    } finally {
      if (original !== undefined) {
        process.env.CALENDAR_DB_PATH = original;
      } else {
        delete process.env.CALENDAR_DB_PATH;
      }
    }
  });

  it("getDbPath rejects path traversal sequences", () => {
    const original = process.env.CALENDAR_DB_PATH;
    process.env.CALENDAR_DB_PATH = "/some/path/../../etc/calendar.db";
    try {
      expect(() => getDbPath()).toThrow();
    } finally {
      if (original !== undefined) {
        process.env.CALENDAR_DB_PATH = original;
      } else {
        delete process.env.CALENDAR_DB_PATH;
      }
    }
  });

  it("getDbPath rejects empty string", () => {
    const original = process.env.CALENDAR_DB_PATH;
    process.env.CALENDAR_DB_PATH = "";
    try {
      expect(() => getDbPath()).toThrow();
    } finally {
      if (original !== undefined) {
        process.env.CALENDAR_DB_PATH = original;
      } else {
        delete process.env.CALENDAR_DB_PATH;
      }
    }
  });
});
