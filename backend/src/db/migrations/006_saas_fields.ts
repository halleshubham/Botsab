import { Knex } from "knex";

export async function up(knex: Knex) {
  await knex.schema.alterTable("users", (t) => {
    // 'pending' | 'active' | 'suspended'
    t.string("status", 20).notNullable().defaultTo("active");
    // 'starter' | 'pro' | 'business'
    t.string("plan", 20).notNullable().defaultTo("starter");
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("status");
    t.dropColumn("plan");
  });
}
