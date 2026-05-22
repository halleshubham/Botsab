export type WebhookEventType =
  | "qr"
  | "connection.open"
  | "connection.close"
  | "message.received"
  | "message.sent"
  | "message.receipt"
  | "group.update"
  | "contact.update";

export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = [
  "qr",
  "connection.open",
  "connection.close",
  "message.received",
  "message.sent",
  "message.receipt",
  "group.update",
  "contact.update",
];

export interface WebhookPayload {
  instanceId: string;
  userId: string;
  event: WebhookEventType;
  timestamp: number;
  data: Record<string, unknown>;
}
