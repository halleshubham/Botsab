import type { WASocket } from "@whiskeysockets/baileys";
import { logger } from "../utils/logger.js";

export interface MentionOptions {
  /** WhatsApp's native "@all" mention (one flag, rendered by recent clients) */
  mentionAll?: boolean;
  /** Mention every participant individually (works on every client) */
  tagAll?: boolean;
}

const PARTICIPANTS_TTL_MS = 5 * 60 * 1000;
const participantsCache = new Map<string, { at: number; jids: string[] }>();

const userPart = (jid?: string | null) => jid?.split("@")[0].split(":")[0];

async function groupParticipantJids(socket: WASocket, groupJid: string): Promise<string[]> {
  const cached = participantsCache.get(groupJid);
  if (cached && Date.now() - cached.at < PARTICIPANTS_TTL_MS) return cached.jids;

  const meta = await socket.groupMetadata(groupJid);
  // Skip ourselves - matched against both our phone JID and LID, since v7
  // groups may list participants by either
  const me = new Set([userPart(socket.user?.id), userPart(socket.user?.lid)].filter(Boolean));
  const jids = meta.participants.map((p) => p.id).filter((id) => !me.has(userPart(id)));
  participantsCache.set(groupJid, { at: Date.now(), jids });
  return jids;
}

/**
 * Extra fields to spread into a Baileys message for the requested group
 * mentions. Only applies to group JIDs; a member lookup failure for tagAll
 * is logged and the message still goes out (with mentionAll, if set).
 */
export async function buildMentions(
  socket: WASocket,
  jid: string,
  opts: MentionOptions
): Promise<{ mentions?: string[]; mentionAll?: boolean }> {
  if (!jid.endsWith("@g.us") || (!opts.mentionAll && !opts.tagAll)) return {};
  const extra: { mentions?: string[]; mentionAll?: boolean } = {};
  if (opts.mentionAll) extra.mentionAll = true;
  if (opts.tagAll) {
    try {
      extra.mentions = await groupParticipantJids(socket, jid);
    } catch (err) {
      logger.warn({ jid, err: err instanceof Error ? err.message : err }, "tagAll: could not load group members, sending without them");
    }
  }
  return extra;
}
