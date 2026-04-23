import pino, { type LoggerOptions } from "pino";

const opts: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "sentinel-api", env: process.env.NODE_ENV ?? "production" },
};
if (process.env.NODE_ENV === "development") {
  opts.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
  };
}
export const logger = pino(opts);
