import { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.raw(`CREATE TYPE instance_status AS ENUM ('disconnected', 'qr_pending', 'connected')`);

  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary();
    t.string("email", 255).notNullable().unique();
    t.string("password_hash", 255).notNullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("api_keys", (t) => {
    t.uuid("id").primary();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("key_hash", 64).notNullable();
    t.string("label", 100).notNullable();
    t.timestamp("last_used_at", { useTz: true }).nullable();
    t.boolean("revoked").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX api_keys_active_idx ON api_keys(key_hash) WHERE revoked = FALSE`);

  await knex.schema.createTable("instances", (t) => {
    t.string("id", 150).primary();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("slug", 50).notNullable();
    t.string("phone_number", 30).nullable();
    t.specificType("status", "instance_status").notNullable().defaultTo("disconnected");
    t.string("webhook_url", 500).nullable();
    t.jsonb("webhook_events").notNullable().defaultTo("[]");
    t.string("webhook_secret", 64).nullable();
    t.string("sessions_dir", 500).notNullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.unique(["user_id", "slug"]);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists("instances");
  await knex.schema.dropTableIfExists("api_keys");
  await knex.schema.dropTableIfExists("users");
  await knex.raw("DROP TYPE IF EXISTS instance_status");
}
