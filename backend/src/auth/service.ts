import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "../db";
import { config } from "../config";
import { sendRegistrationPending } from "../services/mailer";

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

const PLAN_LIMITS: Record<string, number> = {
  starter: 1,
  pro: 3,
  business: 10,
};

export async function registerUser(email: string, password: string, plan = "starter") {
  const existing = await db("users").where({ email }).first();
  if (existing) throw new Error("Email already registered");

  const password_hash = await bcrypt.hash(password, config.bcryptRounds);

  const isSuperadmin =
    config.superadminEmail.length > 0 &&
    email.toLowerCase() === config.superadminEmail.toLowerCase();

  const validPlan = PLAN_LIMITS[plan] !== undefined ? plan : "starter";

  const [user] = await db("users")
    .insert({
      id: crypto.randomUUID(),
      email,
      password_hash,
      role: isSuperadmin ? "superadmin" : "user",
      // Superadmin is active immediately; regular users wait for approval
      status: isSuperadmin ? "active" : "pending",
      plan: isSuperadmin ? "business" : validPlan,
      instance_limit: isSuperadmin ? -1 : 0,
    })
    .returning(["id", "email", "role", "status", "plan", "created_at"]);

  const apiKey = await createApiKey(user.id, "default");

  // Fire-and-forget — don't let a mail failure block registration
  if (!isSuperadmin) {
    sendRegistrationPending(email, validPlan).catch(() => {});
  }

  return { userId: user.id, apiKey: apiKey.key, role: user.role, status: user.status };
}

export async function loginUser(email: string, password: string) {
  const user = await db("users").where({ email }).first();
  if (!user) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials");

  const apiKey = await createApiKey(user.id, `login-${new Date().toISOString().slice(0, 10)}`);
  return { userId: user.id, role: user.role as string, apiKey: apiKey.key };
}
