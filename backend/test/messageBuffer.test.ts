import { test } from "node:test";
import assert from "node:assert/strict";
import type { WAMessage } from "@whiskeysockets/baileys";
import { MessageBuffer, MAX_MESSAGES_PER_CHAT, MESSAGE_TTL_MS, toContextMessage } from "../src/services/messageBuffer.js";

const BOT = { jid: "919000000000@s.whatsapp.net", lid: "111111@lid" };
const GROUP = "120363000000000001@g.us";
const text = (id: string, body: string, extra: Partial<WAMessage> = {}): WAMessage => ({
  key: { remoteJid: GROUP, id, fromMe: false, participant: "919811111111@s.whatsapp.net" },
  pushName: "Asha",
  messageTimestamp: 1763500000,
  message: { conversation: body },
  ...extra,
});

function filled(buf: MessageBuffer, ids: string[]) {
  for (const id of ids) buf.add("inst", GROUP, toContextMessage(text(id, `msg ${id}`), BOT)!);
}

test("around: up to 5 before, the message, and everything after it", () => {
  const buf = new MessageBuffer();
  filled(buf, ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "TAG", "a1", "a2"]);
  const ctx = buf.around("inst", GROUP, "TAG", 5)!;
  assert.deepEqual(ctx.before.map((m) => m.id), ["m3", "m4", "m5", "m6", "m7"]);
  assert.equal(ctx.message.id, "TAG");
  assert.deepEqual(ctx.after.map((m) => m.id), ["a1", "a2"]);
  assert.deepEqual(buf.around("inst", GROUP, "TAG", 5, 0)!.after, []);
  assert.equal(buf.around("inst", GROUP, "unknown"), null);
  assert.equal(buf.around("other-instance", GROUP, "TAG"), null);
});

test("keeps message meta for context", () => {
  const item = toContextMessage(text("m1", "hello"), BOT)!;
  assert.deepEqual(item, {
    id: "m1", fromMe: false, senderId: "919811111111@s.whatsapp.net", senderPhone: "919811111111",
    senderName: "Asha", timestamp: 1763500000, text: "hello", mentions: [], media: null, replyTo: null,
  });
});

test("media messages carry a downloadable message; the bot's own messages are marked fromMe", () => {
  const doc = toContextMessage(text("d1", "", { message: { documentMessage: { fileName: "a.pdf", mimetype: "application/pdf", mediaKey: "a2V5", directPath: "/v/x" } } }), BOT)!;
  assert.equal(doc.media?.fileName, "a.pdf");
  assert.deepEqual(doc.message?.key, { remoteJid: GROUP, id: "d1", fromMe: false, participant: "919811111111@s.whatsapp.net" });

  const mine = toContextMessage({ key: { remoteJid: GROUP, id: "b1", fromMe: true }, message: { conversation: "✅ Done" } }, BOT)!;
  assert.equal(mine.fromMe, true);
  assert.equal(mine.senderId, BOT.jid);
  assert.equal(mine.message, undefined);
});

test("reactions, protocol messages and empty messages are not recorded", () => {
  assert.equal(toContextMessage(text("r1", "", { message: { reactionMessage: { text: "👍" } } }), BOT), null);
  assert.equal(toContextMessage(text("p1", "", { message: { protocolMessage: {} } }), BOT), null);
  assert.equal(toContextMessage({ key: { remoteJid: GROUP, id: "e1" } }, BOT), null);
});

test("keeps only the last 50 messages per chat and replaces re-deliveries", () => {
  const buf = new MessageBuffer();
  const ids = Array.from({ length: MAX_MESSAGES_PER_CHAT + 10 }, (_, i) => `m${i}`);
  filled(buf, ids);
  assert.equal(buf.around("inst", GROUP, "m9"), null, "oldest 10 dropped");
  assert.equal(buf.around("inst", GROUP, "m10")!.before.length, 0);

  buf.add("inst", GROUP, toContextMessage(text("m59", "edited copy"), BOT)!);
  const last = buf.around("inst", GROUP, "m59")!;
  assert.equal(last.message.text, "edited copy");
  assert.equal(last.before.length, 5);
});

test("messages expire after 24 hours", () => {
  let now = 1_000_000;
  const buf = new MessageBuffer(() => now);
  filled(buf, ["old"]);
  now += MESSAGE_TTL_MS - 1;
  filled(buf, ["new"]);
  assert.ok(buf.around("inst", GROUP, "old"));
  now += 2;
  assert.equal(buf.around("inst", GROUP, "old"), null);
  assert.deepEqual(buf.around("inst", GROUP, "new")!.before, []);
});

test("clear() forgets an instance (on logout)", () => {
  const buf = new MessageBuffer();
  filled(buf, ["m1"]);
  buf.clear("inst");
  assert.equal(buf.around("inst", GROUP, "m1"), null);
});
