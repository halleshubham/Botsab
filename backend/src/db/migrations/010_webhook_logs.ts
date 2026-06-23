import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("webhook_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("instance_id").notNullable().references("id").inTable("instances").onDelete("CASCADE");
    t.text("event").notNullable();
    t.text("url").notNullable();
    t.integer("status_code").nullable();
    t.integer("duration_ms").nullable();
    t.text("error").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.table("webhook_logs", (t) => {
    t.index(["instance_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("webhook_logs");
}
