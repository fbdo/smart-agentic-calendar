export type LoggingLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

export const LOG_LEVEL_SEVERITY: Record<LoggingLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
  emergency: 7,
};

export interface Logger {
  debug(logger: string, data: unknown): void;
  info(logger: string, data: unknown): void;
  notice(logger: string, data: unknown): void;
  warning(logger: string, data: unknown): void;
  error(logger: string, data: unknown): void;
  critical(logger: string, data: unknown): void;
  alert(logger: string, data: unknown): void;
  emergency(logger: string, data: unknown): void;
}

export type LogTransport = (level: LoggingLevel, logger: string, data: unknown) => void;

export class AppLogger implements Logger {
  private readonly transports: LogTransport[];

  constructor(transports: LogTransport[]) {
    this.transports = [...transports];
  }

  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  debug(logger: string, data: unknown): void {
    this.emit("debug", logger, data);
  }

  info(logger: string, data: unknown): void {
    this.emit("info", logger, data);
  }

  notice(logger: string, data: unknown): void {
    this.emit("notice", logger, data);
  }

  warning(logger: string, data: unknown): void {
    this.emit("warning", logger, data);
  }

  error(logger: string, data: unknown): void {
    this.emit("error", logger, data);
  }

  critical(logger: string, data: unknown): void {
    this.emit("critical", logger, data);
  }

  alert(logger: string, data: unknown): void {
    this.emit("alert", logger, data);
  }

  emergency(logger: string, data: unknown): void {
    this.emit("emergency", logger, data);
  }

  private emit(level: LoggingLevel, logger: string, data: unknown): void {
    for (const transport of this.transports) {
      transport(level, logger, data);
    }
  }
}

export function createStderrTransport(minLevel: LoggingLevel): LogTransport {
  const minSeverity = LOG_LEVEL_SEVERITY[minLevel];
  return (level: LoggingLevel, logger: string, data: unknown): void => {
    if (LOG_LEVEL_SEVERITY[level] < minSeverity) return;
    const timestamp = new Date().toISOString();
    const message = typeof data === "string" ? data : JSON.stringify(data);
    process.stderr.write(`${timestamp} [${level.toUpperCase()}] [${logger}] ${message}\n`);
  };
}

export function createNoOpLogger(): Logger {
  const noop = (): void => {
    // Intentionally empty - no-op logger
  };
  return {
    debug: noop,
    info: noop,
    notice: noop,
    warning: noop,
    error: noop,
    critical: noop,
    alert: noop,
    emergency: noop,
  };
}
