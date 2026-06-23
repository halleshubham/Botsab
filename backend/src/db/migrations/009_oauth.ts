import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("oauth_clients", (t) => {
    t.uuid("id").primary();
    t.text("client_id").unique().notNullable();
    t.text("client_secret_hash").nullable();
    t.text("client_name").notNullable();
    t.jsonb("redirect_uris").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("oauth_codes", (t) => {
    t.uuid("id").primary();
    t.text("code").unique().notNullable();
    t.text("client_id").notNullable().references("client_id").inTable("oauth_clients").onDelete("CASCADE");
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.text("redirect_uri").notNullable();
    t.text("code_challenge").notNullable();
    t.timestamp("expires_at").notNullable();
    t.boolean("used").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("oauth_tokens", (t) => {
    t.uuid("id").primary();
    t.text("access_token_hash").unique().notNullable();
    t.text("refresh_token_hash").unique().nullable();
    t.text("client_id").notNullable().references("client_id").inTable("oauth_clients").onDelete("CASCADE");
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.text("scope").notNullable().defaultTo("mcp");
    t.timestamp("expires_at").notNullable();
    t.timestamp("refresh_expires_at").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("oauth_tokens");
  await knex.schema.dropTableIfExists("oauth_codes");
  await knex.schema.dropTableIfExists("oauth_clients");
}
