import { Router, Request, Response } from "express";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware";
import { db } from "../db";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

// GET /instances/:instanceId/phone-contacts?q=search&limit=200
router.get("/", async (req: Request, res: Response) => {
  const { q, limit = "200" } = req.query as { q?: string; limit?: string };
  const cap = Math.min(parseInt(limit) || 200, 500);

  let query = db("whatsapp_contacts")
    .where({ instance_id: req.params.instanceId })
    .orderByRaw("COALESCE(name, notify, phone_number) ASC")
    .limit(cap)
    .select("jid", "phone_number", "name", "notify");

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    query = query.where((b) =>
      b
        .whereRaw("LOWER(name) LIKE ?", [like])
        .orWhereRaw("LOWER(notify) LIKE ?", [like])
        .orWhereRaw("phone_number LIKE ?", [`%${q}%`])
    );
  }

  const contacts = await query;
  res.json(contacts);
});

export default router;
