import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("instances", (t) => {
    t.text("proxy_url").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("instances", (t) => {
    t.dropColumn("proxy_url");
  });
}
