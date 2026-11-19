import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { downloadMediaMessage, generateWAMessage, prepareWAMessageMedia, type proto, type WAMessage } from "@whiskeysockets/baileys";
import { assertDownloadableMedia, enrichMessage, extractQuoted, quotedOption } from "../src/services/incoming.js";

const BOT = { jid: "919000000000:5@s.whatsapp.net", lid: "111111:5@lid" };
const GROUP = "120363000000000001@g.us";

// A PDF shared in a group by a member WhatsApp lists by LID, captioned with a tag of the bot
const pdfInGroup = (): WAMessage => ({
  key: { remoteJid: GROUP, id: "MSG1", fromMe: false, participant: "222222@lid", participantAlt: "919811111111@s.whatsapp.net" } as WAMessage["key"],
  pushName: "Asha",
  messageTimestamp: 1763500000,
  message: {
    documentWithCaptionMessage: {
      message: {
        documentMessage: {
          caption: "@111111 please upload this",
          fileName: "Preamble.pdf",
          mimetype: "application/pdf",
          fileLength: 123456,
          contextInfo: { mentionedJid: ["111111@lid"] },
        },
      },
    },
  },
});

test("enrich: document caption, file details, sender phone via participantAlt, LID mention of the bot", () => {
  const e = enrichMessage(pdfInGroup(), BOT);
  assert.equal(e.isGroup, true);
  assert.equal(e.groupId, GROUP);
  assert.equal(e.senderId, "222222@lid");
  assert.equal(e.senderPhone, "919811111111");
  assert.equal(e.senderName, "Asha");
  assert.equal(e.text, "@111111 please upload this");
  assert.equal(e.isMentioned, true);
  assert.deepEqual(e.media, { type: "document", mimetype: "application/pdf", fileName: "Preamble.pdf", size: 123456, caption: "@111111 please upload this" });
  assert.equal(e.quoted, null);
});

test("enrich: a tagged reply exposes the quoted file and a downloadable message for it", () => {
  const msg: WAMessage = {
    key: { remoteJid: GROUP, id: "MSG2", fromMe: false, participant: "919811111111@s.whatsapp.net" },
    message: {
      // Disappearing-message wrapper must be unwrapped too
      ephemeralMessage: {
        message: {
          extendedTextMessage: {
            text: "@919000000000 upload this to the website",
            contextInfo: {
              mentionedJid: ["919000000000@s.whatsapp.net"],
              stanzaId: "FILE1",
              participant: "919822222222@s.whatsapp.net",
              quotedMessage: { documentMessage: { fileName: "Notes.pdf", mimetype: "application/pdf", fileLength: 999 } },
            },
          },
        },
      },
    },
  };
  const e = enrichMessage(msg, BOT);
  assert.equal(e.isMentioned, true);
  assert.equal(e.senderPhone, "919811111111");
  assert.equal(e.media, null);
  assert.equal(e.quoted?.id, "FILE1");
  assert.equal(e.quoted?.participantPhone, "919822222222");
  assert.equal(e.quoted?.media?.fileName, "Notes.pdf");
  assert.deepEqual(e.quoted?.message.key, { remoteJid: GROUP, id: "FILE1", participant: "919822222222@s.whatsapp.net", fromMe: false });
});

test("enrich: plain 1:1 text keeps the original webhook fields", () => {
  const e = enrichMessage({ key: { remoteJid: "919833333333@s.whatsapp.net", id: "M3", fromMe: false }, message: { conversation: "hi" } }, BOT);
  assert.equal(e.isGroup, false);
  assert.equal(e.groupId, null);
  assert.equal(e.senderId, "919833333333@s.whatsapp.net");
  assert.equal(e.senderPhone, "919833333333");
  assert.equal(e.text, "hi");
  assert.deepEqual(e.mentions, []);
  assert.equal(e.isMentioned, false);
});

test("media download only accepts WhatsApp media servers", () => {
  const doc = (extra: Record<string, unknown>) => ({ documentMessage: { mediaKey: "a2V5", mimetype: "application/pdf", ...extra } }) as proto.IMessage;
  assert.doesNotThrow(() => assertDownloadableMedia(doc({ url: "https://mmg.whatsapp.net/v/t62/x.enc", directPath: "/v/t62/x.enc" })));
  assert.doesNotThrow(() => assertDownloadableMedia(doc({ directPath: "/v/t62/x.enc" })));
  assert.throws(() => assertDownloadableMedia(doc({ url: "https://169.254.169.254/latest/meta-data" })), /WhatsApp media URL/);
  assert.throws(() => assertDownloadableMedia(doc({ url: "https://evil.example/whatsapp.net" })), /WhatsApp media URL/);
  assert.throws(() => assertDownloadableMedia(doc({ url: "http://mmg.whatsapp.net/x" })), /WhatsApp media URL/);
  assert.throws(() => assertDownloadableMedia(doc({ directPath: "//evil.example/x" })), /directPath/);
  assert.throws(() => assertDownloadableMedia({ documentMessage: { directPath: "/x" } }), /mediaKey/);
  assert.throws(() => assertDownloadableMedia({ conversation: "hello" }), /no image, video, document/);
});

test("download decrypts a real WhatsApp-encrypted file byte-for-byte", async (t) => {
  const original = fs.readFileSync(new URL("../package.json", import.meta.url));
  // Encrypt exactly as a WhatsApp upload would, capturing the encrypted bytes
  let encrypted: Buffer | null = null;
  const prepared = await prepareWAMessageMedia(
    { document: original, mimetype: "application/json", fileName: "package.json" },
    {
      upload: async (encFilePath: string) => {
        encrypted = fs.readFileSync(encFilePath);
        return { mediaUrl: "https://mmg.whatsapp.net/v/t62/test.enc", directPath: "/v/t62/test.enc" };
      },
    } as never
  );
  const message: WAMessage = { key: { remoteJid: GROUP, id: "FILE2", fromMe: false }, message: prepared };
  assert.doesNotThrow(() => assertDownloadableMedia(message.message));

  // Serve the encrypted bytes as WhatsApp's media server would
  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL) => {
    requested.push(String(url));
    return new Response(encrypted!);
  });
  const decrypted = await downloadMediaMessage(message, "buffer", {});
  assert.ok(decrypted.equals(original));
  assert.ok(requested.length > 0, "the download must go through the (mocked) media server");
  assert.ok(requested.every((u) => new URL(u).hostname === "mmg.whatsapp.net"));
});

test("quotedOption turns a send into a reply to that message", async () => {
  assert.deepEqual(quotedOption(GROUP, undefined), {});
  const quoted = extractQuoted(
    { extendedTextMessage: { text: "x", contextInfo: { stanzaId: "FILE1", participant: "919822222222@s.whatsapp.net", quotedMessage: { conversation: "the original" } } } },
    GROUP
  )!;
  const opts = quotedOption(GROUP, { id: quoted.id, participant: quoted.participant!, message: quoted.message.message });
  const reply = await generateWAMessage(GROUP, { text: "✅ Done" }, { userJid: BOT.jid, upload: async () => ({}), ...opts } as never);
  const ctx = reply.message?.extendedTextMessage?.contextInfo;
  assert.equal(ctx?.stanzaId, "FILE1");
  assert.equal(ctx?.participant, "919822222222@s.whatsapp.net");
  assert.equal(ctx?.quotedMessage?.conversation, "the original");
});
