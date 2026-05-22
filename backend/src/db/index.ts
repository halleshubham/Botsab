import Knex from "knex";
import path from "path";
import { config } from "../config";

export const db = Knex({
  client: "pg",
  connection: config.databaseUrl,
  pool: { min: 2, max: 10 },
  acquireConnectionTimeout: 10_000,
  migrations: {
    directory: path.join(__dirname, "migrations"),
    extension: process.env.NODE_ENV === "production" ? "js" : "ts",
    loadExtensions: process.env.NODE_ENV === "production" ? [".js"] : [".ts"],
  },
});
