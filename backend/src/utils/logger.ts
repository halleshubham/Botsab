import pino from "pino";
import { config } from "../config.js";

export const logger = pino(
  {
    level: config.nodeEnv === "production" ? "info" : "debug",
    redact: {
      paths: ["*.message.message", "*.message.extendedTextMessage", "req.headers.authorization", "req.headers['x-api-key']"],
      censor: "[REDACTED]",
    },
  },
  config.nodeEnv === "production"
    ? undefined
    : pino.transport({ target: "pino-pretty", options: { colorize: true } })
);
