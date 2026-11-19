import type { WAMessage } from "@whiskeysockets/baileys";
import { describeMedia, enrichMessage, type DownloadableMessage, type MediaInfo } from "./incoming.js";

// Short-lived, in-memory record of recent messages per chat, so a tagged
// request can be handed to an automation with the conversation around it
// (the few messages before the tag and everything after it). Nothing is
// written to the database or disk; entries expire and a restart clears all.

export const MAX_MESSAGES_PER_CHAT = 50;
export const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CHATS_PER_INSTANCE = 500;

export interface ContextMessage {
  id: string;
  fromMe: boolean;
  senderId: string;
  senderPhone: string | null;
  senderName: string | null;
  timestamp: number | null;
  text: string | null;
  mentions: string[];
  media: MediaInfo | null;
  /** id of the message this one replied to, if any */
  replyTo: string | null;
  /** Present for media messages: POST to /instances/:id/messages/media to download the file */
  message?: DownloadableMessage;
}

interface Entry { at: number; item: ContextMessage }

// Messages that carry no conversation content
const SKIP_TYPES = ["protocolMessage", "reactionMessage", "senderKeyDistributionMessage", "pollUpdateMessage"];

export function toContextMessage(msg: WAMessage, botIds: { jid: string; lid?: string | null }): ContextMessage | null {
  if (!msg.key.id || !msg.message) return null;
  const keys = Object.keys(msg.message).filter((k) => k !== "messageContextInfo");
  if (keys.length === 0 || keys.every((k) => SKIP_TYPES.includes(k))) return null;

  const e = enrichMessage(msg, botIds);
  const fromMe = !!msg.key.fromMe;
  const item: ContextMessage = {
    id: msg.key.id,
    fromMe,
    senderId: fromMe ? botIds.jid : e.senderId,
    senderPhone: fromMe ? null : e.senderPhone,
    senderName: fromMe ? null : e.senderName,
    timestamp: e.timestamp,
    text: e.text,
    mentions: e.mentions,
    media: e.media,
    replyTo: e.quoted?.id ?? null,
  };
  if (describeMedia(msg.message)) {
    item.message = {
      key: { remoteJid: e.remoteJid, id: msg.key.id, fromMe, ...(msg.key.participant ? { participant: msg.key.participant } : {}) },
      message: msg.message,
    };
  }
  return item;
}

export class MessageBuffer {
  private chats = new Map<string, Map<string, Entry[]>>(); // instanceId → chatJid → oldest-first

  constructor(private now: () => number = Date.now) {}

  add(instanceId: string, chatJid: string, item: ContextMessage): void {
    let byChat = this.chats.get(instanceId);
    if (!byChat) this.chats.set(instanceId, (byChat = new Map()));

    const list = this.fresh(byChat.get(chatJid) ?? []).filter((e) => e.item.id !== item.id); // re-delivery replaces
    list.push({ at: this.now(), item });
    if (list.length > MAX_MESSAGES_PER_CHAT) list.splice(0, list.length - MAX_MESSAGES_PER_CHAT);

    // Re-insert so Map order tracks recent activity; drop the quietest chat past the cap
    byChat.delete(chatJid);
    byChat.set(chatJid, list);
    if (byChat.size > MAX_CHATS_PER_INSTANCE) byChat.delete(byChat.keys().next().value!);
  }

  /** The anchor message with up to `before` earlier and up to `after` later messages (null if not buffered) */
  around(instanceId: string, chatJid: string, messageId: string, before = 5, after = MAX_MESSAGES_PER_CHAT) {
    const list = this.fresh(this.chats.get(instanceId)?.get(chatJid) ?? []);
    const idx = list.findIndex((e) => e.item.id === messageId);
    if (idx === -1) return null;
    return {
      before: list.slice(Math.max(0, idx - before), idx).map((e) => e.item),
      message: list[idx].item,
      after: list.slice(idx + 1, idx + 1 + after).map((e) => e.item),
    };
  }

  clear(instanceId: string): void {
    this.chats.delete(instanceId);
  }

  private fresh(list: Entry[]): Entry[] {
    const cutoff = this.now() - MESSAGE_TTL_MS;
    return list.filter((e) => e.at >= cutoff);
  }
}

export const messageBuffer = new MessageBuffer();
