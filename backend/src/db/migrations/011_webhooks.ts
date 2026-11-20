import { Knex } from "knex";

// Several webhooks per instance, each with its own events, secret and filters.
// The instance's existing webhook (instances.webhook_*) is copied over as
// "Default"; those columns are no longer read.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("webhooks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("instance_id").notNullable().references("id").inTable("instances").onDelete("CASCADE");
    t.string("name", 100).notNullable().defaultTo("");
    t.text("url").notNullable();
    t.jsonb("events").notNullable().defaultTo("[]");
    t.string("secret", 64).nullable();
    t.jsonb("filters").notNullable().defaultTo("{}");
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.index(["instance_id"]);
  });

  await knex.raw(`
    INSERT INTO webhooks (instance_id, name, url, events, secret)
    SELECT id, 'Default', webhook_url, COALESCE(webhook_events, '[]'::jsonb), webhook_secret
    FROM instances
    WHERE webhook_url IS NOT NULL AND webhook_url <> ''
  `);

  await knex.schema.alterTable("webhook_logs", (t) => {
    t.uuid("webhook_id").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("webhook_logs", (t) => {
    t.dropColumn("webhook_id");
  });
  await knex.schema.dropTableIfExists("webhooks");
}
