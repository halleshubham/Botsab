import crypto from "crypto";
import { Router, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { db } from "../db/index.js";
import { requireApiKey } from "../auth/middleware.js";
import { createBotsabMcpServer } from "./server.js";

const router = Router();

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function resolveUserId(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice(7);
    const tokenRow = await db("oauth_tokens")
      .where({ access_token_hash: sha256(raw) })
      .where("expires_at", ">", new Date())
      .select("user_id")
      .first();

    if (!tokenRow) {
      res.status(401).json({ error: "invalid_token", error_description: "OAuth token is invalid or expired" });
      return null;
    }
    return tokenRow.user_id as string;
  }

  // Fall back to x-api-key — call requireApiKey as a promise
  return new Promise((resolve) => {
    requireApiKey(req, res, () => resolve(req.userId));
  });
}

router.post("/", async (req: Request, res: Response) => {
  const userId = await resolveUserId(req, res);
  if (!userId) return; // response already sent

  const server = createBotsabMcpServer(userId);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no sessions
  });

  res.on("finish", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", error_description: (err as Error).message });
    }
  }
});

// MCP spec requires GET and DELETE for session management endpoints; in stateless
// mode these return 405 since there are no sessions to manage.
router.get("/", (_req: Request, res: Response) => {
  res.status(405).json({ error: "method_not_allowed", error_description: "This MCP server is stateless. Use POST for all requests." });
});

router.delete("/", (_req: Request, res: Response) => {
  res.status(405).json({ error: "method_not_allowed", error_description: "This MCP server is stateless. No sessions to delete." });
});

export default router;
