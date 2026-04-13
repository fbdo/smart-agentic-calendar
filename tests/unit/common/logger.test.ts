import { describe, it, expect, vi } from "vitest";
import {
  AppLogger,
  createStderrTransport,
  createNoOpLogger,
  type LoggingLevel,
  LOG_LEVEL_SEVERITY,
} from "../../../src/common/logger.js";

describe("LOG_LEVEL_SEVERITY", () => {
  it("orders levels from debug (0) to emergency (7)", () => {
    expect(LOG_LEVEL_SEVERITY.debug).toBe(0);
    expect(LOG_LEVEL_SEVERITY.info).toBe(1);
    expect(LOG_LEVEL_SEVERITY.notice).toBe(2);
    expect(LOG_LEVEL_SEVERITY.warning).toBe(3);
    expect(LOG_LEVEL_SEVERITY.error).toBe(4);
    expect(LOG_LEVEL_SEVERITY.critical).toBe(5);
    expect(LOG_LEVEL_SEVERITY.alert).toBe(6);
    expect(LOG_LEVEL_SEVERITY.emergency).toBe(7);
  });
});

describe("AppLogger", () => {
  it("dispatches to all transports", () => {
    const t1 = vi.fn();
    const t2 = vi.fn();
    const logger = new AppLogger([t1, t2]);

    logger.info("test", "hello");

    expect(t1).toHaveBeenCalledWith("info", "test", "hello");
    expect(t2).toHaveBeenCalledWith("info", "test", "hello");
  });

  it("dispatches each level method correctly", () => {
    const transport = vi.fn();
    const logger = new AppLogger([transport]);
    const levels: LoggingLevel[] = [
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ];

    for (const level of levels) {
      logger[level]("comp", { msg: level });
    }

    expect(transport).toHaveBeenCalledTimes(8);
    for (let i = 0; i < levels.length; i++) {
      expect(transport).toHaveBeenNthCalledWith(i + 1, levels[i], "comp", { msg: levels[i] });
    }
  });

  it("works with no transports", () => {
    const logger = new AppLogger([]);
    expect(() => logger.info("test", "no-op")).not.toThrow();
  });

  it("supports addTransport for late wiring", () => {
    const logger = new AppLogger([]);
    const transport = vi.fn();

    logger.addTransport(transport);
    logger.info("test", "late");

    expect(transport).toHaveBeenCalledWith("info", "test", "late");
  });
});

describe("createStderrTransport", () => {
  it("writes messages at or above min level", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const transport = createStderrTransport("warning");

    transport("warning", "test", "a warning");
    expect(writeSpy).toHaveBeenCalledTimes(1);

    transport("error", "test", "an error");
    expect(writeSpy).toHaveBeenCalledTimes(2);

    writeSpy.mockRestore();
  });

  it("filters messages below min level", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const transport = createStderrTransport("warning");

    transport("debug", "test", "ignored");
    transport("info", "test", "ignored");
    transport("notice", "test", "ignored");
    expect(writeSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
  });

  it("formats output as timestamp [LEVEL] [logger] message", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const transport = createStderrTransport("debug");

    transport("info", "scheduler", "replan done");

    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T.+ \[INFO\] \[scheduler\] replan done\n$/);

    writeSpy.mockRestore();
  });

  it("JSON-stringifies non-string data", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const transport = createStderrTransport("debug");

    transport("info", "test", { count: 3 });

    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain('{"count":3}');

    writeSpy.mockRestore();
  });
});

describe("createNoOpLogger", () => {
  it("returns a logger where all methods are callable no-ops", () => {
    const logger = createNoOpLogger();
    const levels: LoggingLevel[] = [
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ];

    for (const level of levels) {
      expect(() => logger[level]("test", "data")).not.toThrow();
    }
  });
});
