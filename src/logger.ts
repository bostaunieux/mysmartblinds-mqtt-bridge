import winston, { config, format } from "winston";

const { combine, timestamp, label, simple, printf } = format;

const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

let logLevel = process.env.LOG_LEVEL;
if (!logLevel || !config.cli.levels[logLevel]) {
  logLevel = "info";
}

const logger = winston.createLogger({
  level: logLevel,
  format: combine(timestamp(), format.colorize({ all: true }), format.splat(), format.simple(), myFormat),
  defaultMeta: {},
  transports: [new winston.transports.Console()],
});

export default logger;
