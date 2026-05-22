import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? "3000"),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? "12"),
  sessionsDir: process.env.SESSIONS_DIR ?? "./sessions",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "100"),
  webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? "10000"),
  webhookMaxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES ?? "3"),
  superadminEmail: process.env.SUPERADMIN_EMAIL ?? "",
};
