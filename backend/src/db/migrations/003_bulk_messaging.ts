import { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.schema.createTable("contact_lists", (t) => {
    t.uuid("id").primary();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("name", 100).notNullable();
    t.text("description").nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("contact_list_members", (t) => {
    t.uuid("id").primary();
    t.uuid("list_id").notNullable().references("id").inTable("contact_lists").onDelete("CASCADE");
    t.string("phone_number", 30).notNullable();
    t.string("label", 100).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.unique(["list_id", "phone_number"]);
  });

  await knex.schema.createTable("group_lists", (t) => {
    t.uuid("id").primary();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("name", 100).notNullable();
    t.text("description").nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("group_list_members", (t) => {
    t.uuid("id").primary();
    t.uuid("list_id").notNullable().references("id").inTable("group_lists").onDelete("CASCADE");
    t.string("group_jid", 150).notNullable();
    t.string("label", 100).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.unique(["list_id", "group_jid"]);
  });

  await knex.schema.createTable("bulk_campaigns", (t) => {
    t.uuid("id").primary();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("instance_id", 150).notNullable().references("id").inTable("instances").onDelete("CASCADE");
    t.string("list_type", 10).notNullable();
    t.uuid("list_id").notNullable();
    t.jsonb("message_payload").notNullable();
    t.jsonb("options").notNullable();
    t.string("status", 20).notNullable().defaultTo("pending");
    t.integer("total_count").notNullable().defaultTo(0);
    t.integer("sent_count").notNullable().defaultTo(0);
    t.integer("failed_count").notNullable().defaultTo(0);
    t.integer("skipped_count").notNullable().defaultTo(0);
    t.timestamp("started_at", { useTz: true }).nullable();
    t.timestamp("completed_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("bulk_campaign_results", (t) => {
    t.uuid("id").primary();
    t.uuid("campaign_id").notNullable().references("id").inTable("bulk_campaigns").onDelete("CASCADE");
    t.string("recipient", 150).notNullable();
    t.string("status", 20).notNullable();
    t.text("error").nullable();
    t.timestamp("sent_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists("bulk_campaign_results");
  await knex.schema.dropTableIfExists("bulk_campaigns");
  await knex.schema.dropTableIfExists("group_list_members");
  await knex.schema.dropTableIfExists("group_lists");
  await knex.schema.dropTableIfExists("contact_list_members");
  await knex.schema.dropTableIfExists("contact_lists");
}
