import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/index.js";
import { sessionManager } from "../sessions/manager.js";
import {
  enqueueCampaign,
  cancelCampaign,
  DEFAULT_OPTIONS,
  DEFAULT_GROUP_OPTIONS,
} from "../services/bulkSender.js";
import type { GroupMetadata } from "@whiskeysockets/baileys";

async function ownsInstance(userId: string, instanceId: string) {
  const inst = await db("instances").where({ id: instanceId, user_id: userId }).first();
  if (!inst) throw new Error("Instance not found or access denied");
  return inst;
}

function connectedSession(instanceId: string) {
  const meta = sessionManager.getSession(instanceId);
  if (!meta || meta.status !== "connected") throw new Error("Instance is not connected");
  return meta;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: msg }] };
}

export function createBotsabMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "Botsab",
    version: "1.0.0",
  });

  // ── Instances ───────────────────────────────────────────────────────────────
  server.tool("list_instances", "List all WhatsApp instances belonging to your account", {}, async () => {
    const rows = await db("instances")
      .where({ user_id: userId })
      .select("id", "slug", "phone_number", "status", "created_at")
      .orderBy("created_at", "desc");
    return ok(rows);
  });

  server.tool(
    "get_instance_status",
    "Get the current connection status of a WhatsApp instance",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = sessionManager.getSession(instanceId);
        return ok({ instanceId, status: meta?.status ?? "disconnected", hasQr: !!meta?.qr });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "connect_instance",
    "Start a WhatsApp connection for an instance (generates a QR code if not paired)",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        const inst = await ownsInstance(userId, instanceId);
        await sessionManager.createSession(userId, inst.id as string);
        return ok({ status: "connecting", message: "Use get_qr_code to retrieve the QR if this is a fresh pairing" });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "disconnect_instance",
    "Gracefully disconnect a WhatsApp instance without clearing credentials",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        await ownsInstance(userId, instanceId);
        await sessionManager.disconnectSession(instanceId);
        return ok({ status: "disconnected" });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "get_qr_code",
    "Retrieve the current QR code string for pairing a WhatsApp instance",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = sessionManager.getSession(instanceId);
        if (!meta?.qr) return err("No QR code available. Try connect_instance first.");
        return ok({ qr: meta.qr });
      } catch (e) { return err((e as Error).message); }
    }
  );

  // ── Messages ────────────────────────────────────────────────────────────────
  server.tool(
    "send_message",
    "Send a WhatsApp message (text, image, document, audio, or video) to a JID or phone number",
    {
      instanceId: z.string().describe("Instance ID"),
      to: z.string().describe("Recipient JID (e.g. 919876543210@s.whatsapp.net) or bare phone number"),
      type: z.enum(["text", "image", "document", "audio", "video"]).describe("Message type"),
      text: z.string().optional().describe("Text content (for type=text)"),
      url: z.string().optional().describe("Media URL (for image/document/audio/video)"),
      caption: z.string().optional().describe("Media caption (for image/video)"),
      filename: z.string().optional().describe("Filename (for document)"),
      mimetype: z.string().optional().describe("MIME type (for document)"),
      ptt: z.boolean().optional().describe("Push-to-talk audio (for audio)"),
    },
    async ({ instanceId, to, type, text, url, caption, filename, mimetype, ptt }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);

        const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
        let content: Record<string, unknown> = {};

        switch (type) {
          case "text":
            if (!text) return err("text is required for type=text");
            content = { text };
            break;
          case "image":
            if (!url) return err("url is required for type=image");
            content = { image: { url }, caption };
            break;
          case "document":
            if (!url || !filename || !mimetype) return err("url, filename, and mimetype are required for type=document");
            content = { document: { url }, fileName: filename, mimetype };
            break;
          case "audio":
            if (!url) return err("url is required for type=audio");
            content = { audio: { url }, ptt: ptt ?? false };
            break;
          case "video":
            if (!url) return err("url is required for type=video");
            content = { video: { url }, caption };
            break;
        }

        const result = await meta.socket.sendMessage(
          jid,
          content as Parameters<typeof meta.socket.sendMessage>[1]
        );
        return ok({ messageId: result?.key?.id, status: "sent" });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "send_bulk_messages",
    "Send multiple messages in sequence with a delay between each",
    {
      instanceId: z.string().describe("Instance ID"),
      messages: z.array(z.object({
        to: z.string(),
        type: z.enum(["text", "image", "document", "audio", "video"]),
        text: z.string().optional(),
        url: z.string().optional(),
        caption: z.string().optional(),
        filename: z.string().optional(),
        mimetype: z.string().optional(),
      })).min(1).max(50),
      delayMs: z.number().min(500).max(30000).default(2000).describe("Delay between messages in milliseconds"),
    },
    async ({ instanceId, messages, delayMs }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);
        const results = [];

        for (const msg of messages) {
          try {
            const jid = msg.to.includes("@") ? msg.to : `${msg.to}@s.whatsapp.net`;
            let content: Record<string, unknown> = {};
            switch (msg.type) {
              case "text":     content = { text: msg.text! }; break;
              case "image":    content = { image: { url: msg.url! }, caption: msg.caption }; break;
              case "document": content = { document: { url: msg.url! }, fileName: msg.filename, mimetype: msg.mimetype }; break;
              case "audio":    content = { audio: { url: msg.url! } }; break;
              case "video":    content = { video: { url: msg.url! }, caption: msg.caption }; break;
            }
            const r = await meta.socket.sendMessage(jid, content as Parameters<typeof meta.socket.sendMessage>[1]);
            results.push({ to: msg.to, status: "sent", messageId: r?.key?.id });
          } catch (e) {
            results.push({ to: msg.to, status: "failed", error: (e as Error).message });
          }
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        }
        return ok({ sent: results.filter((r) => r.status === "sent").length, results });
      } catch (e) { return err((e as Error).message); }
    }
  );

  // ── Groups ──────────────────────────────────────────────────────────────────
  server.tool(
    "list_groups",
    "List all WhatsApp groups the instance is a member of",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);
        const groups = await meta.socket.groupFetchAllParticipating();
        const result = (Object.values(groups) as GroupMetadata[]).map((g) => ({
          id: g.id,
          name: g.subject ?? null,
          participantCount: g.participants.length,
          createdAt: g.creation ? new Date(g.creation * 1000).toISOString() : null,
        }));
        return ok(result);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "get_group",
    "Get detailed metadata for a specific WhatsApp group",
    {
      instanceId: z.string().describe("Instance ID"),
      groupId: z.string().describe("Group JID (e.g. 120363000000000000@g.us)"),
    },
    async ({ instanceId, groupId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);
        const jid = groupId.endsWith("@g.us") ? groupId : `${groupId}@g.us`;
        const metadata = await meta.socket.groupMetadata(jid);
        return ok(metadata);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "send_group_message",
    "Send a message to a WhatsApp group",
    {
      instanceId: z.string().describe("Instance ID"),
      groupId: z.string().describe("Group JID or numeric ID"),
      type: z.enum(["text", "image", "document", "video"]),
      text: z.string().optional(),
      url: z.string().optional(),
      caption: z.string().optional(),
      filename: z.string().optional(),
      mimetype: z.string().optional(),
    },
    async ({ instanceId, groupId, type, text, url, caption, filename, mimetype }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);
        const jid = groupId.endsWith("@g.us") ? groupId : `${groupId}@g.us`;

        let content: Record<string, unknown> = {};
        switch (type) {
          case "text":     if (!text) return err("text is required"); content = { text }; break;
          case "image":    if (!url) return err("url is required"); content = { image: { url }, caption }; break;
          case "document": if (!url || !filename || !mimetype) return err("url, filename, mimetype required"); content = { document: { url }, fileName: filename, mimetype }; break;
          case "video":    if (!url) return err("url is required"); content = { video: { url }, caption }; break;
        }

        const result = await meta.socket.sendMessage(jid, content as Parameters<typeof meta.socket.sendMessage>[1]);
        return ok({ messageId: result?.key?.id, groupId: jid, status: "sent" });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "create_group",
    "Create a new WhatsApp group",
    {
      instanceId: z.string().describe("Instance ID"),
      name: z.string().min(1).max(100).describe("Group name"),
      participants: z.array(z.string()).min(1).describe("List of JIDs (e.g. 919876543210@s.whatsapp.net)"),
    },
    async ({ instanceId, name, participants }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);
        const result = await meta.socket.groupCreate(name, participants);
        return ok(result);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "manage_group_participants",
    "Add, remove, promote, or demote participants in a WhatsApp group",
    {
      instanceId: z.string().describe("Instance ID"),
      groupId: z.string().describe("Group JID or numeric ID"),
      action: z.enum(["add", "remove", "promote", "demote"]).describe("Action to perform"),
      participants: z.array(z.string()).min(1).describe("List of participant JIDs"),
    },
    async ({ instanceId, groupId, action, participants }) => {
      try {
        await ownsInstance(userId, instanceId);
        const meta = connectedSession(instanceId);
        const jid = groupId.endsWith("@g.us") ? groupId : `${groupId}@g.us`;
        const result = await meta.socket.groupParticipantsUpdate(jid, participants, action);
        return ok({ result });
      } catch (e) { return err((e as Error).message); }
    }
  );

  // ── Campaigns ───────────────────────────────────────────────────────────────
  server.tool(
    "list_campaigns",
    "List bulk messaging campaigns for an instance",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const rows = await db("bulk_campaigns")
          .where({ instance_id: instanceId, user_id: userId })
          .orderBy("created_at", "desc")
          .limit(50)
          .select("id", "list_type", "status", "total_count", "sent_count", "failed_count", "created_at", "completed_at");
        return ok(rows);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "get_campaign",
    "Get details and results for a specific campaign",
    {
      instanceId: z.string().describe("Instance ID"),
      campaignId: z.string().describe("Campaign ID"),
    },
    async ({ instanceId, campaignId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const campaign = await db("bulk_campaigns")
          .where({ id: campaignId, instance_id: instanceId, user_id: userId })
          .first();
        if (!campaign) return err("Campaign not found");
        const results = await db("bulk_campaign_results")
          .where({ campaign_id: campaignId })
          .limit(500)
          .select("recipient", "status", "error", "sent_at");
        return ok({ ...campaign, results });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "create_campaign",
    "Create and enqueue a bulk messaging campaign targeting a contact list or group list",
    {
      instanceId: z.string().describe("Instance ID"),
      list_type: z.enum(["contact", "group"]).describe("Target list type"),
      list_id: z.string().describe("Contact list ID or group list ID"),
      message_type: z.enum(["text", "image", "document", "video"]).describe("Message type"),
      text: z.string().optional().describe("Text content (for type=text)"),
      url: z.string().optional().describe("Media URL"),
      caption: z.string().optional().describe("Media caption"),
      filename: z.string().optional().describe("Filename (for document)"),
      mimetype: z.string().optional().describe("MIME type (for document)"),
    },
    async ({ instanceId, list_type, list_id, message_type, text, url, caption, filename, mimetype }) => {
      try {
        await ownsInstance(userId, instanceId);

        let message: Record<string, unknown>;
        switch (message_type) {
          case "text":
            if (!text) return err("text is required for type=text");
            message = { type: "text", text };
            break;
          case "image":
            if (!url) return err("url is required for type=image");
            message = { type: "image", url, caption };
            break;
          case "document":
            if (!url || !filename || !mimetype) return err("url, filename, mimetype required for document");
            message = { type: "document", url, filename, mimetype };
            break;
          case "video":
            if (!url) return err("url is required for type=video");
            message = { type: "video", url, caption };
            break;
        }

        const defaults = list_type === "group" ? DEFAULT_GROUP_OPTIONS : DEFAULT_OPTIONS;
        const [campaign] = await db("bulk_campaigns")
          .insert({
            id: crypto.randomUUID(),
            instance_id: instanceId,
            user_id: userId,
            list_type,
            list_id,
            message_payload: JSON.stringify(message!),
            options: JSON.stringify(defaults),
            status: "pending",
            total_count: 0,
            sent_count: 0,
            failed_count: 0,
            skipped_count: 0,
            created_at: new Date(),
          })
          .returning("id");

        enqueueCampaign(instanceId, campaign.id as string);
        return ok({ id: campaign.id, status: "queued" });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "cancel_campaign",
    "Cancel a running or queued campaign",
    {
      instanceId: z.string().describe("Instance ID"),
      campaignId: z.string().describe("Campaign ID"),
    },
    async ({ instanceId, campaignId }) => {
      try {
        await ownsInstance(userId, instanceId);
        cancelCampaign(campaignId, instanceId);
        return ok({ cancelled: true });
      } catch (e) { return err((e as Error).message); }
    }
  );

  // ── Contact Lists ───────────────────────────────────────────────────────────
  server.tool("list_contact_lists", "List all contact lists in your account", {}, async () => {
    const rows = await db("contact_lists")
      .where({ user_id: userId })
      .select("id", "name", "description", "created_at")
      .orderBy("created_at", "desc");
    return ok(rows);
  });

  server.tool(
    "get_contact_list",
    "Get a contact list with all its members",
    { listId: z.string().describe("Contact list ID") },
    async ({ listId }) => {
      try {
        const list = await db("contact_lists").where({ id: listId, user_id: userId }).first();
        if (!list) return err("Contact list not found");
        const members = await db("contact_list_members")
          .where({ list_id: listId })
          .select("id", "phone_number", "label", "created_at");
        return ok({ ...list, members });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "create_contact_list",
    "Create a new contact list",
    {
      name: z.string().min(1).max(100).describe("List name"),
      description: z.string().max(500).optional().describe("Optional description"),
    },
    async ({ name, description }) => {
      try {
        const [row] = await db("contact_lists")
          .insert({ id: crypto.randomUUID(), user_id: userId, name, description: description ?? null, created_at: new Date() })
          .returning(["id", "name", "description", "created_at"]);
        return ok(row);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "add_contacts",
    "Add phone numbers to a contact list",
    {
      listId: z.string().describe("Contact list ID"),
      members: z.array(z.object({
        phone_number: z.string().describe("Phone number (digits only, with country code)"),
        label: z.string().optional().describe("Optional label/name"),
      })).min(1).max(500),
    },
    async ({ listId, members }) => {
      try {
        const list = await db("contact_lists").where({ id: listId, user_id: userId }).first();
        if (!list) return err("Contact list not found");
        const rows = members.map((m) => ({
          id: crypto.randomUUID(),
          list_id: listId,
          phone_number: m.phone_number,
          label: m.label ?? null,
          created_at: new Date(),
        }));
        await db("contact_list_members")
          .insert(rows)
          .onConflict(["list_id", "phone_number"])
          .ignore();
        return ok({ attempted: rows.length });
      } catch (e) { return err((e as Error).message); }
    }
  );

  // ── Group Lists ─────────────────────────────────────────────────────────────
  server.tool("list_group_lists", "List all group lists in your account", {}, async () => {
    const rows = await db("group_lists")
      .where({ user_id: userId })
      .select("id", "name", "description", "created_at")
      .orderBy("created_at", "desc");
    return ok(rows);
  });

  server.tool(
    "get_group_list",
    "Get a group list with all its member JIDs",
    { listId: z.string().describe("Group list ID") },
    async ({ listId }) => {
      try {
        const list = await db("group_lists").where({ id: listId, user_id: userId }).first();
        if (!list) return err("Group list not found");
        const members = await db("group_list_members")
          .where({ list_id: listId })
          .select("id", "group_jid", "label", "created_at");
        return ok({ ...list, members });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "create_group_list",
    "Create a new group list",
    {
      name: z.string().min(1).max(100).describe("List name"),
      description: z.string().max(500).optional().describe("Optional description"),
    },
    async ({ name, description }) => {
      try {
        const [row] = await db("group_lists")
          .insert({ id: crypto.randomUUID(), user_id: userId, name, description: description ?? null, created_at: new Date() })
          .returning(["id", "name", "description", "created_at"]);
        return ok(row);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "add_group_jids",
    "Add group JIDs to a group list",
    {
      listId: z.string().describe("Group list ID"),
      members: z.array(z.object({
        group_jid: z.string().describe("Group JID (e.g. 120363000000000000@g.us)"),
        label: z.string().optional().describe("Optional label"),
      })).min(1).max(500),
    },
    async ({ listId, members }) => {
      try {
        const list = await db("group_lists").where({ id: listId, user_id: userId }).first();
        if (!list) return err("Group list not found");
        const rows = members.map((m) => ({
          id: crypto.randomUUID(),
          list_id: listId,
          group_jid: m.group_jid,
          label: m.label ?? null,
          created_at: new Date(),
        }));
        await db("group_list_members")
          .insert(rows)
          .onConflict(["list_id", "group_jid"])
          .ignore();
        return ok({ attempted: rows.length });
      } catch (e) { return err((e as Error).message); }
    }
  );

  // ── Utilities ───────────────────────────────────────────────────────────────
  server.tool(
    "search_contacts",
    "Search synced WhatsApp contacts by name or phone number",
    {
      instanceId: z.string().describe("Instance ID"),
      query: z.string().min(1).describe("Search query (name or phone number fragment)"),
    },
    async ({ instanceId, query }) => {
      try {
        await ownsInstance(userId, instanceId);
        const rows = await db("whatsapp_contacts")
          .where({ instance_id: instanceId })
          .andWhere((qb) => {
            qb.whereILike("name", `%${query}%`).orWhereILike("phone_number", `%${query}%`);
          })
          .select("jid", "phone_number", "name", "notify")
          .limit(50);
        return ok(rows);
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "get_webhook",
    "Get the webhook configuration for an instance",
    { instanceId: z.string().describe("Instance ID") },
    async ({ instanceId }) => {
      try {
        await ownsInstance(userId, instanceId);
        const row = await db("instances")
          .where({ id: instanceId })
          .select("webhook_url", "webhook_events", "webhook_has_secret")
          .first();
        return ok({
          url: row?.webhook_url ?? null,
          events: row?.webhook_events ?? [],
          hasSecret: row?.webhook_has_secret ?? false,
        });
      } catch (e) { return err((e as Error).message); }
    }
  );

  server.tool(
    "set_webhook",
    "Set or update the webhook URL and events for an instance",
    {
      instanceId: z.string().describe("Instance ID"),
      url: z.string().url().nullable().describe("Webhook URL (null to disable)"),
      events: z.array(z.string()).describe("List of event types to subscribe to"),
      secret: z.string().optional().describe("Optional HMAC signing secret"),
    },
    async ({ instanceId, url, events, secret }) => {
      try {
        await ownsInstance(userId, instanceId);
        const update: Record<string, unknown> = {
          webhook_url: url,
          webhook_events: JSON.stringify(events),
        };
        if (secret !== undefined) {
          update.webhook_secret = secret;
          update.webhook_has_secret = true;
        }
        await db("instances").where({ id: instanceId }).update(update);
        return ok({ updated: true, url, events });
      } catch (e) { return err((e as Error).message); }
    }
  );

  return server;
}
