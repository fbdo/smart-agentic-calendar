import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
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
    const testDbPath = "./test-data/override.db";
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

  it("getDbPath accepts absolute paths outside the working directory", () => {
    const original = process.env.CALENDAR_DB_PATH;
    const absolutePath = path.join(os.tmpdir(), "smart-agentic-calendar-test.db");
    process.env.CALENDAR_DB_PATH = absolutePath;
    try {
      expect(getDbPath()).toBe(absolutePath);
    } finally {
      if (original !== undefined) {
        process.env.CALENDAR_DB_PATH = original;
      } else {
        delete process.env.CALENDAR_DB_PATH;
      }
    }
  });

  it("getDbPath accepts paths containing '..' segments", () => {
    const original = process.env.CALENDAR_DB_PATH;
    process.env.CALENDAR_DB_PATH = "./data/../calendar.db";
    try {
      expect(getDbPath()).toBe("./data/../calendar.db");
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
