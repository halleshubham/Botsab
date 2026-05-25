import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("opt_outs", (t) => {
    t.uuid("id").primary();
    t.text("instance_id").notNullable().index();
    t.text("jid").notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.unique(["instance_id", "jid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("opt_outs");
}
