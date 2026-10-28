import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWAMessageContent } from "@whiskeysockets/baileys";
import { buildMentions } from "../src/services/mentions.js";

// Minimal stand-in for a Baileys socket: our own account plus a group whose
// participants are listed by a mix of LIDs and phone JIDs (as v7 groups are)
function fakeSocket() {
  const socket = {
    calls: 0,
    user: { id: "919000000000:5@s.whatsapp.net", lid: "111111@lid" },
    async groupMetadata(jid: string) {
      socket.calls++;
      if (jid.startsWith("999")) throw new Error("not-authorized");
      return { participants: [{ id: "111111@lid" }, { id: "222222@lid" }, { id: "919811111111@s.whatsapp.net" }] };
    },
  };
  return socket;
}

// Each test uses its own group id - the participants cache is module-level
test("mentionAll sets only WhatsApp's native @all flag", async () => {
  const sock = fakeSocket();
  assert.deepEqual(await buildMentions(sock as never, "120363000000000001@g.us", { mentionAll: true }), { mentionAll: true });
  assert.equal(sock.calls, 0);
});

test("tagAll mentions every member except our own account", async () => {
  const sock = fakeSocket();
  const out = await buildMentions(sock as never, "120363000000000002@g.us", { tagAll: true });
  assert.deepEqual(out, { mentions: ["222222@lid", "919811111111@s.whatsapp.net"] });
});

test("group members are looked up once and cached", async () => {
  const sock = fakeSocket();
  const jid = "120363000000000003@g.us";
  await buildMentions(sock as never, jid, { tagAll: true });
  await buildMentions(sock as never, jid, { mentionAll: true, tagAll: true });
  assert.equal(sock.calls, 1);
});

test("individual chats ignore both flags", async () => {
  const sock = fakeSocket();
  assert.deepEqual(await buildMentions(sock as never, "919876543210@s.whatsapp.net", { mentionAll: true, tagAll: true }), {});
});

test("a failed member lookup still sends with @all", async () => {
  const sock = fakeSocket();
  assert.deepEqual(await buildMentions(sock as never, "999000@g.us", { mentionAll: true, tagAll: true }), { mentionAll: true });
});

test("Baileys turns both flags into the WhatsApp mention fields", async () => {
  const sock = fakeSocket();
  const extra = await buildMentions(sock as never, "120363000000000004@g.us", { mentionAll: true, tagAll: true });
  const msg = await generateWAMessageContent({ text: "@all meeting at 6pm", ...extra }, { upload: async () => ({}) } as never);
  const ctx = msg.extendedTextMessage?.contextInfo;
  assert.equal(ctx?.nonJidMentions, 1);
  assert.deepEqual(ctx?.mentionedJid, ["222222@lid", "919811111111@s.whatsapp.net"]);
});
