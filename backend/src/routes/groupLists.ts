import { Router, Request, Response } from "express";
import { z } from "zod";

import { requireApiKey } from "../auth/middleware";
import { db } from "../db";
import { MAX_GROUPS_PER_LIST, MAX_LISTS_PER_USER } from "../services/bulkSender";

const router = Router();
router.use(requireApiKey);

router.get("/", async (req: Request, res: Response) => {
  const lists = await db("group_lists")
    .where({ user_id: req.userId })
    .orderBy("created_at", "desc")
    .select("id", "name", "description", "created_at");

  const counts = await db("group_list_members")
    .whereIn("list_id", lists.map((l) => l.id))
    .groupBy("list_id")
    .select("list_id")
    .count("id as count");

  const countMap = Object.fromEntries(counts.map((c) => [c.list_id, Number(c.count)]));
  res.json(lists.map((l) => ({ ...l, memberCount: countMap[l.id] ?? 0 })));
});

router.post("/", async (req: Request, res: Response) => {
  const { name, description } = z
    .object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    })
    .parse(req.body);

  const existing = await db("group_lists").where({ user_id: req.userId }).count("id as c").first();
  if (Number(existing?.c ?? 0) >= MAX_LISTS_PER_USER) {
    return res.status(400).json({ error: `Maximum ${MAX_LISTS_PER_USER} group lists allowed` });
  }

  const id = crypto.randomUUID();
  await db("group_lists").insert({ id, user_id: req.userId, name, description: description ?? null });
  res.status(201).json({ id, name, description: description ?? null, memberCount: 0 });
});

router.get("/:listId", async (req: Request, res: Response) => {
  const list = await db("group_lists").where({ id: req.params.listId, user_id: req.userId }).first();
  if (!list) return res.status(404).json({ error: "List not found" });

  const members = await db("group_list_members")
    .where({ list_id: req.params.listId })
    .orderBy("created_at", "desc")
    .select("id", "group_jid", "label", "created_at");

  res.json({ ...list, members });
});

router.put("/:listId", async (req: Request, res: Response) => {
  const body = z
    .object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).nullable().optional(),
    })
    .parse(req.body);

  const list = await db("group_lists").where({ id: req.params.listId, user_id: req.userId }).first();
  if (!list) return res.status(404).json({ error: "List not found" });

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  await db("group_lists").where({ id: req.params.listId }).update(update);
  res.json({ ...list, ...update });
});

router.delete("/:listId", async (req: Request, res: Response) => {
  const list = await db("group_lists").where({ id: req.params.listId, user_id: req.userId }).first();
  if (!list) return res.status(404).json({ error: "List not found" });
  await db("group_lists").where({ id: req.params.listId }).delete();
  res.json({ success: true });
});

router.post("/:listId/members", async (req: Request, res: Response) => {
  const body = z
    .object({
      members: z
        .array(
          z.object({
            group_jid: z.string().min(5).max(150),
            label: z.string().max(100).optional(),
          })
        )
        .min(1)
        .max(MAX_GROUPS_PER_LIST),
    })
    .parse(req.body);

  const list = await db("group_lists").where({ id: req.params.listId, user_id: req.userId }).first();
  if (!list) return res.status(404).json({ error: "List not found" });

  const current = await db("group_list_members")
    .where({ list_id: req.params.listId })
    .count("id as c")
    .first();
  const currentCount = Number(current?.c ?? 0);

  const available = MAX_GROUPS_PER_LIST - currentCount;
  if (available <= 0) {
    return res.status(400).json({ error: `List is at capacity (${MAX_GROUPS_PER_LIST} groups)` });
  }

  const toAdd = body.members.slice(0, available);
  const rows = toAdd.map((m) => ({
    id: crypto.randomUUID(),
    list_id: req.params.listId,
    group_jid: m.group_jid.endsWith("@g.us") ? m.group_jid : `${m.group_jid}@g.us`,
    label: m.label ?? null,
  }));

  await db("group_list_members").insert(rows).onConflict(["list_id", "group_jid"]).ignore();
  res.status(201).json({ added: rows.length, skipped: body.members.length - rows.length });
});

router.delete("/:listId/members/:memberId", async (req: Request, res: Response) => {
  const list = await db("group_lists").where({ id: req.params.listId, user_id: req.userId }).first();
  if (!list) return res.status(404).json({ error: "List not found" });
  await db("group_list_members")
    .where({ id: req.params.memberId, list_id: req.params.listId })
    .delete();
  res.json({ success: true });
});

export default router;
