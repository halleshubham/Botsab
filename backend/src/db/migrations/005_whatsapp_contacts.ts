import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("whatsapp_contacts", (t) => {
    t.uuid("id").primary();
    t.text("instance_id").notNullable().index();
    t.text("jid").notNullable();
    t.text("phone_number").notNullable();
    t.text("name").nullable();        // name saved in your phone book
    t.text("notify").nullable();      // name they broadcast on WhatsApp
    t.timestamp("updated_at").defaultTo(knex.fn.now());
    t.unique(["instance_id", "jid"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("whatsapp_contacts");
}
