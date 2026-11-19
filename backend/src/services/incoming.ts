import { normalizeMessageContent, getContentType, type proto, type WAMessage } from "@whiskeysockets/baileys";

// Pure helpers that turn a raw Baileys message into the `enriched` part of the
// message.received webhook, plus the checks used when a webhook consumer (e.g.
// n8n) sends a message back to download its media.

const MEDIA_TYPES = ["imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"] as const;
type MediaKey = (typeof MEDIA_TYPES)[number];

export interface MediaInfo {
  type: "image" | "video" | "document" | "audio" | "sticker";
  mimetype: string | null;
  fileName: string | null;
  size: number | null;
  caption: string | null;
  seconds?: number;
  width?: number;
  height?: number;
}

/** A message in the shape POST /messages/media accepts back, ready to download */
export interface DownloadableMessage {
  key: { remoteJid: string; id: string; participant?: string; fromMe: boolean };
  message: proto.IMessage;
}

export interface QuotedInfo {
  id: string;
  participant: string | null;
  participantPhone: string | null;
  text: string | null;
  media: MediaInfo | null;
  /** Send this to POST /instances/:id/messages/media to download the quoted file */
  message: DownloadableMessage;
}

// "919607459969:15@s.whatsapp.net" → "919607459969@s.whatsapp.net"
export function normalizeJid(jid: string): string {
  const atIdx = jid.lastIndexOf("@");
  const domain = atIdx !== -1 ? jid.slice(atIdx) : "@s.whatsapp.net";
  const user = (atIdx !== -1 ? jid.slice(0, atIdx) : jid).split(":")[0];
  return user + domain;
}

/** Digits of a phone-number JID; null for LIDs, groups or empty input */
export function phoneOf(...jids: (string | null | undefined)[]): string | null {
  for (const jid of jids) {
    if (jid && jid.endsWith("@s.whatsapp.net")) return normalizeJid(jid).split("@")[0];
  }
  return null;
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number((v as { toString(): string }).toString());
  return Number.isFinite(n) ? n : null;
};

function mediaKeyOf(content: proto.IMessage | null | undefined): MediaKey | null {
  const type = content ? getContentType(content) : undefined;
  return type && (MEDIA_TYPES as readonly string[]).includes(type) ? (type as MediaKey) : null;
}

export function describeMedia(raw: proto.IMessage | null | undefined): MediaInfo | null {
  const content = normalizeMessageContent(raw);
  const key = mediaKeyOf(content);
  if (!content || !key) return null;
  const m = content[key] as {
    mimetype?: string | null; fileName?: string | null; fileLength?: unknown; caption?: string | null;
    seconds?: number | null; width?: number | null; height?: number | null;
  };
  const info: MediaInfo = {
    type: key.replace("Message", "") as MediaInfo["type"],
    mimetype: m.mimetype ?? null,
    fileName: m.fileName ?? null,
    size: toNumber(m.fileLength),
    caption: m.caption ?? null,
  };
  if (m.seconds) info.seconds = m.seconds;
  if (m.width) info.width = m.width;
  if (m.height) info.height = m.height;
  return info;
}

export function extractText(raw: proto.IMessage | null | undefined): string | null {
  const c = normalizeMessageContent(raw);
  return (
    c?.conversation ??
    c?.extendedTextMessage?.text ??
    c?.imageMessage?.caption ??
    c?.videoMessage?.caption ??
    c?.documentMessage?.caption ??
    null
  );
}

function contextInfoOf(raw: proto.IMessage | null | undefined): proto.IContextInfo | null {
  const content = normalizeMessageContent(raw);
  if (!content) return null;
  for (const value of Object.values(content)) {
    if (value && typeof value === "object" && "contextInfo" in value && value.contextInfo) {
      return value.contextInfo as proto.IContextInfo;
    }
  }
  return null;
}

export function extractQuoted(raw: proto.IMessage | null | undefined, remoteJid: string): QuotedInfo | null {
  const ctx = contextInfoOf(raw);
  if (!ctx?.stanzaId || !ctx.quotedMessage) return null;
  const participant = ctx.participant ?? null;
  return {
    id: ctx.stanzaId,
    participant,
    participantPhone: phoneOf(participant),
    text: extractText(ctx.quotedMessage),
    media: describeMedia(ctx.quotedMessage),
    message: {
      key: { remoteJid, id: ctx.stanzaId, ...(participant ? { participant } : {}), fromMe: false },
      message: ctx.quotedMessage,
    },
  };
}

/** The `enriched` object sent with every message.received webhook */
export function enrichMessage(msg: WAMessage, botIds: { jid: string; lid?: string | null }) {
  const remoteJid = msg.key.remoteJid ?? "";
  const isGroup = remoteJid.endsWith("@g.us");
  const key = msg.key as typeof msg.key & { participantAlt?: string; remoteJidAlt?: string };
  const senderId = isGroup ? (key.participant ?? "") : remoteJid;

  const mentions = (contextInfoOf(msg.message)?.mentionedJid ?? []).map(normalizeJid);
  const bot = normalizeJid(botIds.jid);
  const botLid = botIds.lid ? normalizeJid(botIds.lid) : null;

  return {
    id: msg.key.id,
    remoteJid,
    isGroup,
    groupId: isGroup ? remoteJid : null,
    senderId,
    // Groups may identify the sender by LID only; the phone number then comes from the alt field
    senderPhone: isGroup ? phoneOf(key.participant, key.participantAlt) : phoneOf(remoteJid, key.remoteJidAlt),
    senderName: msg.pushName ?? null,
    timestamp: toNumber(msg.messageTimestamp),
    text: extractText(msg.message),
    mentions,
    isMentioned: mentions.includes(bot) || (botLid !== null && mentions.includes(botLid)),
    media: describeMedia(msg.message),
    quoted: extractQuoted(msg.message, remoteJid),
  };
}

const WHATSAPP_MEDIA_HOST = /(^|\.)whatsapp\.net$/i;

/**
 * Message content a caller sends back for download must point at WhatsApp's own
 * media servers - Baileys takes the host from the message's `url`, so an
 * unchecked payload could make Botsab fetch arbitrary (internal) URLs.
 * Returns the media content, or throws a message suitable for a 400.
 */
export function assertDownloadableMedia(raw: proto.IMessage | null | undefined) {
  const content = normalizeMessageContent(raw);
  const key = mediaKeyOf(content);
  if (!content || !key) throw new Error("Message has no image, video, document, audio or sticker");
  const media = content[key] as { url?: string | null; directPath?: string | null; mediaKey?: unknown };
  if (!media.mediaKey) throw new Error("Media is missing its mediaKey");
  if (media.url) {
    let host = "";
    try {
      const u = new URL(media.url);
      if (u.protocol === "https:") host = u.hostname;
    } catch { /* invalid */ }
    if (!WHATSAPP_MEDIA_HOST.test(host)) throw new Error("Media URL must be an https WhatsApp media URL");
  }
  if (media.directPath && (!media.directPath.startsWith("/") || media.directPath.startsWith("//"))) {
    throw new Error("Invalid media directPath");
  }
  if (!media.url && !media.directPath) throw new Error("Media has no url or directPath");
  return { content, key };
}

export interface QuoteRef {
  id: string;
  participant?: string;
  fromMe?: boolean;
  /** The original message content (e.g. enriched.quoted.message.message or the webhook's message.message) - lets WhatsApp show the quote preview */
  message?: proto.IMessage;
}

/** Baileys sendMessage options that make a send a reply to `quote` in `chatJid` */
export function quotedOption(chatJid: string, quote: QuoteRef | undefined): { quoted?: WAMessage } {
  if (!quote) return {};
  return {
    quoted: {
      key: { remoteJid: chatJid, id: quote.id, fromMe: quote.fromMe ?? false, ...(quote.participant ? { participant: quote.participant } : {}) },
      message: quote.message ?? { conversation: "" },
    },
  };
}
