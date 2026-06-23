import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, FlaskConical, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listInstances,
  getWebhook,
  updateWebhook,
  getWebhookLogs,
  testWebhook,
  deleteWebhookSecret,
  type WebhookLog,
  type WebhookTestResult,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

// ── Event catalogue ────────────────────────────────────────────────────────────

const EVENT_GROUPS = [
  {
    label: "Connection",
    events: [
      { id: "qr",               label: "QR code",       description: "QR generated — scan to link a new device" },
      { id: "connection.open",  label: "Connected",     description: "Instance successfully connected to WhatsApp" },
      { id: "connection.close", label: "Disconnected",  description: "Instance lost its connection" },
    ],
  },
  {
    label: "Messages",
    events: [
      { id: "message.received", label: "Received",  description: "Incoming message in any chat or group" },
      { id: "message.sent",     label: "Sent",      description: "Outgoing message accepted by WhatsApp" },
      { id: "message.receipt",  label: "Receipt",   description: "Delivery or read acknowledgement" },
    ],
  },
  {
    label: "Groups & contacts",
    events: [
      { id: "group.update",   label: "Group update",   description: "Group name, description or icon changed" },
      { id: "contact.update", label: "Contact update", description: "Contact profile name or photo changed" },
    ],
  },
] as const;

// ── Parent ─────────────────────────────────────────────────────────────────────

export function Webhooks() {
  const { data: instances = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
  });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground">Configure outbound webhook callbacks per instance</p>
      </div>

      {instances.length === 0 && <p className="text-muted-foreground">No instances yet.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-1">
          {instances.map((inst) => (
            <button
              key={inst.id}
              onClick={() => setSelected(inst.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selected === inst.id ? "border-primary bg-primary/5" : "hover:bg-muted"
              }`}
            >
              <p className="font-medium">{inst.slug}</p>
              <p className="text-xs text-muted-foreground">{inst.status}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <WebhookPanel key={selected} instanceId={selected} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select an instance to configure its webhook
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Config + logs panel ────────────────────────────────────────────────────────

function WebhookPanel({ instanceId }: { instanceId: string }) {
  const qc = useQueryClient();
  const { data: wh } = useQuery({
    queryKey: ["webhook", instanceId],
    queryFn: () => getWebhook(instanceId).then((r) => r.data),
  });

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const seeded = useRef(false);

  // Seed form fields once when query data first arrives for this instance
  useEffect(() => {
    if (wh && !seeded.current) {
      seeded.current = true;
      setUrl(wh.url ?? "");
      setEvents(wh.events ?? []);
    }
  }, [wh]);

  function toggleEvent(id: string) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWebhook(instanceId, { url: url.trim() || null, events, ...(secret ? { secret } : {}) });
      qc.invalidateQueries({ queryKey: ["webhook", instanceId] });
      setSecret("");
      toast({ title: "Webhook saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testWebhook(instanceId);
      setTestResult(r.data);
      qc.invalidateQueries({ queryKey: ["webhook-logs", instanceId] });
    } catch {
      toast({ title: "Test request failed", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  async function handleRemoveSecret() {
    await deleteWebhookSecret(instanceId);
    qc.invalidateQueries({ queryKey: ["webhook", instanceId] });
    toast({ title: "Signing secret removed" });
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">

            {/* URL */}
            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://yourapp.com/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!wh?.url || testing}
                  onClick={handleTest}
                  title="Send a test payload to the configured URL"
                >
                  {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  Test
                </Button>
              </div>
              {testResult && (
                <div className={`rounded-md border px-3 py-2 text-sm mt-1 ${
                  testResult.success
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}>
                  {testResult.success
                    ? `✓ ${testResult.statusCode} · ${testResult.durationMs} ms`
                    : `✗ ${testResult.statusCode ?? "no response"} · ${testResult.durationMs} ms · ${testResult.error}`}
                </div>
              )}
            </div>

            {/* Events */}
            <div className="space-y-3">
              <Label>Events to subscribe</Label>
              <div className="space-y-4">
                {EVENT_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {group.label}
                    </p>
                    <div className="space-y-2">
                      {group.events.map((ev) => (
                        <label
                          key={ev.id}
                          className="flex items-start gap-3 cursor-pointer rounded-md border p-2.5 hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={events.includes(ev.id)}
                            onChange={() => toggleEvent(ev.id)}
                            className="mt-0.5 rounded border"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-none">{ev.label}</p>
                            <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Secret */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  Signing secret{" "}
                  {wh?.hasSecret && (
                    <span className="text-xs text-muted-foreground font-normal">(set — enter new to rotate)</span>
                  )}
                </Label>
                {wh?.hasSecret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive hover:text-destructive"
                    onClick={handleRemoveSecret}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <Input
                type="password"
                placeholder={wh?.hasSecret ? "Leave empty to keep current" : "Optional — min 8 characters"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                minLength={secret ? 8 : undefined}
              />
              {secret === "" && !wh?.hasSecret && (
                <p className="text-xs text-muted-foreground">
                  When set, each request includes an <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> header
                  you can verify with HMAC-SHA256.
                </p>
              )}
            </div>

            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DeliveryLog instanceId={instanceId} />
    </>
  );
}

// ── Delivery log ───────────────────────────────────────────────────────────────

function DeliveryLog({ instanceId }: { instanceId: string }) {
  const qc = useQueryClient();
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["webhook-logs", instanceId],
    queryFn: () => getWebhookLogs(instanceId).then((r) => r.data),
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Delivery log <span className="text-muted-foreground font-normal text-sm">(last 3 h)</span></CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["webhook-logs", instanceId] })}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-6 py-4">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 py-4">No deliveries in the last 3 hours.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Event</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Duration</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRow({ log }: { log: WebhookLog }) {
  const ok = log.status_code !== null && log.status_code >= 200 && log.status_code < 300;
  const statusColor = log.status_code === null
    ? "text-muted-foreground"
    : ok
    ? "text-green-600 font-medium"
    : "text-red-600 font-medium";

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-4 py-2">
        <EventBadge event={log.event} />
      </td>
      <td className={`px-4 py-2 tabular-nums ${statusColor}`}>
        {log.status_code ?? "—"}
      </td>
      <td className="px-4 py-2 tabular-nums text-muted-foreground">
        {log.duration_ms != null ? `${log.duration_ms} ms` : "—"}
      </td>
      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
        {relativeTime(log.created_at)}
      </td>
      <td className="px-4 py-2 text-red-600 text-xs max-w-[200px] truncate" title={log.error ?? undefined}>
        {log.error ?? ""}
      </td>
    </tr>
  );
}

const EVENT_COLORS: Record<string, string> = {
  "qr":               "bg-yellow-100 text-yellow-800 border-yellow-200",
  "connection.open":  "bg-green-100 text-green-800 border-green-200",
  "connection.close": "bg-slate-100 text-slate-700 border-slate-200",
  "message.received": "bg-blue-100 text-blue-800 border-blue-200",
  "message.sent":     "bg-indigo-100 text-indigo-800 border-indigo-200",
  "message.receipt":  "bg-purple-100 text-purple-800 border-purple-200",
  "group.update":     "bg-orange-100 text-orange-800 border-orange-200",
  "contact.update":   "bg-pink-100 text-pink-800 border-pink-200",
  "test":             "bg-gray-100 text-gray-700 border-gray-200",
};

function EventBadge({ event }: { event: string }) {
  const cls = EVENT_COLORS[event] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {event}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
