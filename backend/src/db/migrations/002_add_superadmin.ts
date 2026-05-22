import { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("role", 20).notNullable().defaultTo("user");
    t.integer("instance_limit").notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("role");
    t.dropColumn("instance_limit");
  });
}
