import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "../db";
import { config } from "../config";

export function generateApiKey(): string {
  return `wapi_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createApiKey(userId: string, label: string) {
  const raw = generateApiKey();
  const hash = hashApiKey(raw);

  const [row] = await db("api_keys")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      key_hash: hash,
      label,
      revoked: false,
      created_at: new Date(),
    })
    .returning(["id", "label", "created_at"]);

  return { id: row.id, key: raw, label: row.label };
}

export async function revokeApiKey(keyId: string, userId: string) {
  const count = await db("api_keys")
    .where({ id: keyId, user_id: userId })
    .update({ revoked: true });
  return count > 0;
}

export async function registerUser(email: string, password: string) {
  const existing = await db("users").where({ email }).first();
  if (existing) throw new Error("Email already registered");

  const password_hash = await bcrypt.hash(password, config.bcryptRounds);

  const isSuperadmin =
    config.superadminEmail.length > 0 &&
    email.toLowerCase() === config.superadminEmail.toLowerCase();

  const [user] = await db("users")
    .insert({
      id: crypto.randomUUID(),
      email,
      password_hash,
      role: isSuperadmin ? "superadmin" : "user",
      // -1 = unlimited for superadmin; 0 = blocked until admin grants capacity
      instance_limit: isSuperadmin ? -1 : 0,
    })
    .returning(["id", "email", "role", "created_at"]);

  const apiKey = await createApiKey(user.id, "default");
  return { userId: user.id, apiKey: apiKey.key, role: user.role };
}

export async function loginUser(email: string, password: string) {
  const user = await db("users").where({ email }).first();
  if (!user) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials");

  return { userId: user.id, role: user.role as string };
}
