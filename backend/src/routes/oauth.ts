import express, { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db/index.js";
import { config } from "../config.js";

const router = Router();
const urlencodedParser = express.urlencoded({ extended: false });

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many client registrations, try again later" },
});

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ── Discovery ─────────────────────────────────────────────────────────────────
router.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
  const base = config.appUrl;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// ── Dynamic Client Registration (RFC 7591) ────────────────────────────────────
router.post("/oauth/register", registerLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    client_name: z.string().min(1).max(100),
    redirect_uris: z.array(z.string().url()).min(1).max(10),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    scope: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_client_metadata", error_description: parsed.error.message });
  }

  const clientId = `botsab_${crypto.randomBytes(16).toString("hex")}`;
  await db("oauth_clients").insert({
    id: crypto.randomUUID(),
    client_id: clientId,
    client_secret_hash: null,
    client_name: parsed.data.client_name,
    redirect_uris: JSON.stringify(parsed.data.redirect_uris),
    created_at: new Date(),
  });

  res.status(201).json({
    client_id: clientId,
    client_name: parsed.data.client_name,
    redirect_uris: parsed.data.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "mcp",
  });
});

// ── Authorization Endpoint: show login form ───────────────────────────────────
router.get("/oauth/authorize", async (req: Request, res: Response) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = req.query as Record<string, string>;

  if (response_type !== "code") {
    return res.status(400).send("Unsupported response_type. Only 'code' is supported.");
  }
  if (!code_challenge || code_challenge_method !== "S256") {
    return res.status(400).send("PKCE is required. Please include code_challenge and code_challenge_method=S256.");
  }

  const client = await db("oauth_clients").where({ client_id }).first();
  if (!client) return res.status(400).send("Unknown client_id.");

  const allowedUris: string[] = Array.isArray(client.redirect_uris)
    ? (client.redirect_uris as string[])
    : JSON.parse(client.redirect_uris as string);
  const effectiveRedirectUri = redirect_uri || allowedUris[0];
  if (!allowedUris.includes(effectiveRedirectUri)) {
    return res.status(400).send("Invalid redirect_uri.");
  }

  res.send(authorizeHtml({
    clientName: client.client_name as string,
    clientId: client_id,
    redirectUri: effectiveRedirectUri,
    state,
    codeChallenge: code_challenge,
  }));
});

// ── Authorization Endpoint: process login ─────────────────────────────────────
router.post("/oauth/authorize", urlencodedParser, async (req: Request, res: Response) => {
  const { email, password, client_id, redirect_uri, state, code_challenge } = req.body as Record<string, string>;

  const client = await db("oauth_clients").where({ client_id }).first();
  if (!client) return res.status(400).send("Unknown client_id.");

  const renderError = (msg: string) =>
    res.send(authorizeHtml({
      clientName: client.client_name as string,
      clientId: client_id,
      redirectUri: redirect_uri,
      state,
      codeChallenge: code_challenge,
      error: msg,
    }));

  if (!email || !password) return renderError("Email and password are required.");
  if (password.length > 128) return renderError("Invalid email or password.");

  const user = await db("users").where({ email }).first();
  if (!user) return renderError("Invalid email or password.");

  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) return renderError("Invalid email or password.");

  if ((user.status as string) !== "active") {
    return renderError("Your account is not yet active. Please contact support.");
  }

  const code = crypto.randomBytes(32).toString("hex");
  await db("oauth_codes").insert({
    id: crypto.randomUUID(),
    code,
    client_id,
    user_id: user.id,
    redirect_uri,
    code_challenge,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
    used: false,
  });

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  res.redirect(url.toString());
});

// ── Token Endpoint ────────────────────────────────────────────────────────────
router.post("/oauth/token", urlencodedParser, async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");

  const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token } = req.body as Record<string, string>;

  if (grant_type === "authorization_code") {
    if (!code || !code_verifier || !client_id) {
      return res.status(400).json({ error: "invalid_request", error_description: "Missing required parameters" });
    }

    // Atomically mark the code used — prevents double-redemption race
    const [codeRow] = await db("oauth_codes")
      .where({ code, client_id, used: false })
      .update({ used: true })
      .returning("*");
    if (!codeRow) return res.status(400).json({ error: "invalid_grant", error_description: "Invalid or already used code" });
    if (new Date(codeRow.expires_at as string) < new Date()) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Code expired" });
    }
    if (redirect_uri && codeRow.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    }

    // PKCE S256 verification
    const expected = crypto.createHash("sha256").update(code_verifier).digest("base64url");
    if (expected !== codeRow.code_challenge) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }

    const rawAccess = crypto.randomBytes(32).toString("hex");
    const rawRefresh = crypto.randomBytes(32).toString("hex");
    const now = new Date();

    await db("oauth_tokens").insert({
      id: crypto.randomUUID(),
      access_token_hash: sha256(rawAccess),
      refresh_token_hash: sha256(rawRefresh),
      client_id,
      user_id: codeRow.user_id,
      scope: "mcp",
      expires_at: new Date(now.getTime() + 3600 * 1000),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      created_at: now,
    });

    return res.json({
      access_token: rawAccess,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: rawRefresh,
      scope: "mcp",
    });
  }

  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      return res.status(400).json({ error: "invalid_request", error_description: "Missing refresh_token" });
    }

    const tokenRow = await db("oauth_tokens")
      .where({ refresh_token_hash: sha256(refresh_token) })
      .where("refresh_expires_at", ">", new Date())
      .first();

    if (!tokenRow) return res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired refresh token" });

    const rawAccess = crypto.randomBytes(32).toString("hex");
    const now = new Date();

    await db("oauth_tokens").where({ id: tokenRow.id }).update({
      access_token_hash: sha256(rawAccess),
      expires_at: new Date(now.getTime() + 3600 * 1000),
    });

    return res.json({
      access_token: rawAccess,
      token_type: "Bearer",
      expires_in: 3600,
      scope: tokenRow.scope,
    });
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

// ── HTML template ─────────────────────────────────────────────────────────────
interface AuthorizeHtmlOpts {
  clientName: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  error?: string;
}

function authorizeHtml(opts: AuthorizeHtmlOpts): string {
  const { clientName, clientId, redirectUri, state, codeChallenge, error } = opts;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize · Botsab</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.10); padding: 40px; width: 100%; max-width: 420px; }
    .logo { font-size: 22px; font-weight: 700; color: #16a34a; margin-bottom: 24px; text-align: center; }
    h2 { font-size: 18px; font-weight: 600; color: #111; margin-bottom: 6px; text-align: center; }
    .subtitle { font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 28px; }
    .client-name { font-weight: 600; color: #111; }
    label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; outline: none; transition: border-color .15s; margin-bottom: 16px; }
    input:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.12); }
    button { width: 100%; padding: 11px; background: #16a34a; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; }
    button:hover { background: #15803d; }
    .error { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 8px; padding: 10px 14px; font-size: 14px; margin-bottom: 18px; }
    .divider { height: 1px; background: #f3f4f6; margin: 24px 0; }
    .scope-box { background: #f9fafb; border-radius: 8px; padding: 14px; font-size: 13px; color: #374151; margin-bottom: 22px; }
    .scope-box strong { display: block; margin-bottom: 6px; font-size: 13px; color: #111; }
    .scope-item::before { content: "✓ "; color: #16a34a; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Botsab</div>
    <h2>Authorize Access</h2>
    <p class="subtitle"><span class="client-name">${esc(clientName)}</span> is requesting access to your Botsab account</p>

    <div class="scope-box">
      <strong>Permissions requested</strong>
      <div class="scope-item">Read and manage WhatsApp instances</div>
      <div class="scope-item">Send messages and manage groups</div>
      <div class="scope-item">Create and run bulk campaigns</div>
    </div>

    ${error ? `<div class="error">${esc(error)}</div>` : ""}

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${esc(clientId)}">
      <input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
      <input type="hidden" name="state" value="${esc(state ?? "")}">
      <input type="hidden" name="code_challenge" value="${esc(codeChallenge)}">

      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email">

      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password">

      <button type="submit">Sign in &amp; Authorize</button>
    </form>
  </div>
</body>
</html>`;
}

export default router;
