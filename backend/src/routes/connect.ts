import { Router, Request, Response } from "express";
import qrcode from "qrcode";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware";
import { sessionManager } from "../sessions/manager";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

router.post("/connect", async (req: Request, res: Response) => {
  const { instanceId } = req.params;
  const instance = req.instance!;

  await sessionManager.createSession(instance.user_id as string, instanceId);

  const meta = sessionManager.getSession(instanceId);
  res.json({ status: meta?.status ?? "disconnected" });
});

router.get("/qr", async (req: Request, res: Response) => {
  const { instanceId } = req.params;
  const meta = sessionManager.getSession(instanceId);

  if (!meta?.qr) {
    return res.status(404).json({ error: "No QR code available. Instance may already be connected." });
  }

  const qrBase64 = await qrcode.toDataURL(meta.qr);
  res.json({
    qr: qrBase64,
    qrString: meta.qr,
    expiresIn: 60,
  });
});

router.post("/disconnect", async (req: Request, res: Response) => {
  const { instanceId } = req.params;
  await sessionManager.disconnectSession(instanceId);
  res.json({ status: "disconnected" });
});

router.post("/logout", async (req: Request, res: Response) => {
  const { instanceId } = req.params;
  await sessionManager.destroySession(instanceId, true);
  res.json({ status: "logged_out" });
});

router.get("/events", (req: Request, res: Response) => {
  const { instanceId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const cleanup = sessionManager.subscribe(instanceId, send);
  req.on("close", cleanup);
});

export default router;
