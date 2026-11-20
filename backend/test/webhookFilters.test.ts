import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesFilters, parseFilters, webhookFiltersSchema } from "../src/webhooks/filters.js";
import { shouldDeliver } from "../src/webhooks/dispatcher.js";

const GROUP = "120363000000000001@g.us";
const OTHER_GROUP = "120363000000000002@g.us";
const msg = (e: Record<string, unknown>) => ({ message: {}, enriched: e });
const groupMsg = msg({ remoteJid: GROUP, isGroup: true, senderId: "193428214259744@lid", senderPhone: "919811111111", isMentioned: false });
const groupTag = msg({ remoteJid: GROUP, isGroup: true, senderId: "919822222222@s.whatsapp.net", senderPhone: "919822222222", isMentioned: true });
const dm = msg({ remoteJid: "919833333333@s.whatsapp.net", isGroup: false, senderId: "919833333333@s.whatsapp.net", senderPhone: "919833333333", isMentioned: false });
const f = (x: object) => webhookFiltersSchema.parse(x);

test("no filters: every message passes", () => {
  for (const m of [groupMsg, groupTag, dm]) assert.equal(matchesFilters(f({}), "message.received", m), true);
});

test("chat type: groups only / direct only", () => {
  assert.equal(matchesFilters(f({ chatTypes: "groups" }), "message.received", groupMsg), true);
  assert.equal(matchesFilters(f({ chatTypes: "groups" }), "message.received", dm), false);
  assert.equal(matchesFilters(f({ chatTypes: "direct" }), "message.received", dm), true);
  assert.equal(matchesFilters(f({ chatTypes: "direct" }), "message.received", groupMsg), false);
});

test("group list limits groups but leaves direct chats to chatTypes", () => {
  assert.equal(matchesFilters(f({ groups: [GROUP] }), "message.received", groupMsg), true);
  assert.equal(matchesFilters(f({ groups: [OTHER_GROUP] }), "message.received", groupMsg), false);
  assert.equal(matchesFilters(f({ groups: [OTHER_GROUP] }), "message.received", dm), true);
  assert.equal(matchesFilters(f({ groups: [OTHER_GROUP], chatTypes: "groups" }), "message.received", dm), false);
});

test("senders match the phone number in any format, or the LID number", () => {
  assert.equal(matchesFilters(f({ senders: ["+91 98111 11111"] }), "message.received", groupMsg), true);
  assert.equal(matchesFilters(f({ senders: ["193428214259744"] }), "message.received", groupMsg), true);
  assert.equal(matchesFilters(f({ senders: ["919800000000"] }), "message.received", groupMsg), false);
  // sender's number hidden by WhatsApp and not listed by LID: not delivered
  const hidden = msg({ remoteJid: GROUP, isGroup: true, senderId: "555@lid", senderPhone: null });
  assert.equal(matchesFilters(f({ senders: ["919811111111"] }), "message.received", hidden), false);
});

test("mentions only", () => {
  assert.equal(matchesFilters(f({ mentionsOnly: true }), "message.received", groupTag), true);
  assert.equal(matchesFilters(f({ mentionsOnly: true }), "message.received", groupMsg), false);
});

test("all conditions must hold together", () => {
  const filters = f({ chatTypes: "groups", groups: [GROUP], senders: ["919822222222"], mentionsOnly: true });
  assert.equal(matchesFilters(filters, "message.received", groupTag), true);
  assert.equal(matchesFilters(filters, "message.received", groupMsg), false);
});

test("filters only apply to message.received", () => {
  assert.equal(matchesFilters(f({ chatTypes: "groups", mentionsOnly: true }), "connection.open", { phone: "x" }), true);
});

test("stored filters are read leniently", () => {
  assert.deepEqual(parseFilters(null), parseFilters({}));
  assert.equal(parseFilters({ chatTypes: "bogus" }).chatTypes, "all");
});

test("shouldDeliver: enabled, subscribed event, filters", () => {
  const w = { enabled: true, events: ["message.received"], filters: { mentionsOnly: true } };
  assert.equal(shouldDeliver(w, "message.received", groupTag), true);
  assert.equal(shouldDeliver(w, "message.received", groupMsg), false);
  assert.equal(shouldDeliver(w, "connection.open", {}), false);
  assert.equal(shouldDeliver({ ...w, enabled: false }, "message.received", groupTag), false);
  assert.equal(shouldDeliver({ ...w, events: [] }, "connection.open", {}), true); // [] = all events
});
