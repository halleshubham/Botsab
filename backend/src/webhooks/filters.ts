import { z } from "zod";

// Which incoming messages a webhook receives. Applied to message.received
// only; every other event is delivered as before. All conditions must match;
// an empty list or missing field means "no restriction".
export const webhookFiltersSchema = z.object({
  // "groups": group chats only, "direct": 1:1 chats only
  chatTypes: z.enum(["all", "groups", "direct"]).default("all"),
  // Only these groups (group JIDs, …@g.us). Direct chats are unaffected - use chatTypes for those.
  groups: z.array(z.string().regex(/@g\.us$/, "Group IDs end in @g.us")).max(500).default([]),
  // Only messages from these senders: phone numbers with country code (any
  // formatting) or LID numbers
  senders: z.array(z.string().min(1).max(40)).max(500).default([]),
  // Only messages that tag (mention) this WhatsApp account
  mentionsOnly: z.boolean().default(false),
}).strict();

export type WebhookFilters = z.infer<typeof webhookFiltersSchema>;

export const NO_FILTERS: WebhookFilters = { chatTypes: "all", groups: [], senders: [], mentionsOnly: false };

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Reads stored filters leniently: anything invalid counts as "no restriction". */
export function parseFilters(raw: unknown): WebhookFilters {
  const parsed = webhookFiltersSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : NO_FILTERS;
}

export function hasFilters(f: WebhookFilters): boolean {
  return f.chatTypes !== "all" || f.groups.length > 0 || f.senders.length > 0 || f.mentionsOnly;
}

type Enriched = {
  remoteJid?: string;
  isGroup?: boolean;
  senderId?: string;
  senderPhone?: string | null;
  isMentioned?: boolean;
};

export function matchesFilters(f: WebhookFilters, event: string, data: Record<string, unknown>): boolean {
  if (event !== "message.received" || !hasFilters(f)) return true;
  const e = (data.enriched ?? {}) as Enriched;
  const isGroup = e.isGroup ?? String(e.remoteJid ?? "").endsWith("@g.us");

  if (f.chatTypes === "groups" && !isGroup) return false;
  if (f.chatTypes === "direct" && isGroup) return false;
  if (isGroup && f.groups.length > 0 && !f.groups.includes(String(e.remoteJid))) return false;
  if (f.mentionsOnly && !e.isMentioned) return false;
  if (f.senders.length > 0) {
    // The sender's phone number when WhatsApp reveals it, and the user part of
    // their ID (a phone number or a LID number)
    const candidates = [digits(e.senderPhone), digits(String(e.senderId ?? "").split("@")[0].split(":")[0])].filter(Boolean);
    const allowed = f.senders.map(digits).filter(Boolean);
    if (!candidates.some((c) => allowed.includes(c))) return false;
  }
  return true;
}
