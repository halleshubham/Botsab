import { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("phone", 30).nullable();
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("phone");
  });
}
