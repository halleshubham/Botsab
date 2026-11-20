import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, FlaskConical, Trash2, RefreshCw, Plus, Pencil, X, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listInstances,
  listGroups,
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookLogs,
  testWebhook,
  deleteWebhookSecret,
  type Webhook,
  type WebhookFilters,
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
        <p className="text-muted-foreground">Send WhatsApp events to your apps. Each instance can have several webhooks, each with its own events and filters.</p>
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
            <WebhooksPanel key={selected} instanceId={selected} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select an instance to configure its webhooks
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Webhooks of one instance ───────────────────────────────────────────────────

const NO_FILTERS: WebhookFilters = { chatTypes: "all", groups: [], senders: [], mentionsOnly: false };
const MAX_WEBHOOKS = 10;

function WebhooksPanel({ instanceId }: { instanceId: string }) {
  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["webhooks", instanceId],
    queryFn: () => listWebhooks(instanceId).then((r) => r.data),
  });
  // null = closed, "new" = adding, otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Webhooks <span className="text-muted-foreground font-normal text-sm">({webhooks.length}/{MAX_WEBHOOKS})</span>
          </CardTitle>
          <Button size="sm" onClick={() => setEditing("new")} disabled={editing === "new" || webhooks.length >= MAX_WEBHOOKS}>
            <Plus className="h-4 w-4" /> Add webhook
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing === "new" && (
            <WebhookEditor instanceId={instanceId} onDone={() => setEditing(null)} />
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : webhooks.length === 0 && editing !== "new" ? (
            <p className="text-sm text-muted-foreground">No webhooks yet. Add one to start receiving events.</p>
          ) : (
            webhooks.map((w) =>
              editing === w.id ? (
                <WebhookEditor key={w.id} instanceId={instanceId} webhook={w} onDone={() => setEditing(null)} />
              ) : (
                <WebhookCard key={w.id} instanceId={instanceId} webhook={w} onEdit={() => setEditing(w.id)} />
              )
            )
          )}
        </CardContent>
      </Card>

      <DeliveryLog instanceId={instanceId} webhooks={webhooks} />
    </>
  );
}

function describeFilters(f: WebhookFilters): string[] {
  const parts: string[] = [];
  if (f.chatTypes === "groups") parts.push("groups only");
  if (f.chatTypes === "direct") parts.push("direct chats only");
  if (f.groups.length) parts.push(`${f.groups.length} group${f.groups.length > 1 ? "s" : ""}`);
  if (f.senders.length) parts.push(`${f.senders.length} sender${f.senders.length > 1 ? "s" : ""}`);
  if (f.mentionsOnly) parts.push("only when tagged");
  return parts;
}

function WebhookCard({ instanceId, webhook: w, onEdit }: { instanceId: string; webhook: Webhook; onEdit: () => void }) {
  const qc = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const filters = describeFilters(w.filters);
  const refresh = () => qc.invalidateQueries({ queryKey: ["webhooks", instanceId] });

  async function toggle() {
    try {
      await updateWebhook(instanceId, w.id, { enabled: !w.enabled });
      refresh();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult((await testWebhook(instanceId, w.id)).data);
      qc.invalidateQueries({ queryKey: ["webhook-logs", instanceId] });
    } catch {
      toast({ title: "Test request failed", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete webhook "${w.name || w.url}"?`)) return;
    try {
      await deleteWebhook(instanceId, w.id);
      refresh();
      toast({ title: "Webhook deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${w.enabled ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{w.name || "Untitled webhook"}</p>
          <p className="text-xs text-muted-foreground break-all">{w.url}</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs shrink-0 cursor-pointer" title={w.enabled ? "Turn off" : "Turn on"}>
          <input type="checkbox" checked={w.enabled} onChange={toggle} className="rounded border" />
          {w.enabled ? "On" : "Off"}
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(w.events.length ? w.events : ["all events"]).map((e) => (
          <EventBadge key={e} event={e} />
        ))}
        {filters.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
            <Filter className="h-3 w-3" /> {filters.join(" · ")}
          </span>
        )}
        {w.hasSecret && (
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">signed</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
          {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Test
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>
      {testResult && (
        <div className={`rounded-md border px-3 py-2 text-sm ${
          testResult.success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {testResult.success
            ? `✓ ${testResult.statusCode} · ${testResult.durationMs} ms`
            : `✗ ${testResult.statusCode ?? "no response"} · ${testResult.durationMs} ms · ${testResult.error}`}
        </div>
      )}
    </div>
  );
}

function WebhookEditor({ instanceId, webhook, onDone }: { instanceId: string; webhook?: Webhook; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(webhook?.name ?? "");
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [events, setEvents] = useState<string[]>(webhook?.events ?? ["message.received"]);
  const [filters, setFilters] = useState<WebhookFilters>(webhook?.filters ?? NO_FILTERS);
  const [sendersText, setSendersText] = useState((webhook?.filters.senders ?? []).join("\n"));
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  // Message filters only matter when incoming messages are delivered
  const receivesMessages = events.length === 0 || events.includes("message.received");

  function toggleEvent(id: string) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const senders = sendersText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const data = { name: name.trim(), url: url.trim(), events, filters: { ...filters, senders }, ...(secret ? { secret } : {}) };
    try {
      if (webhook) await updateWebhook(instanceId, webhook.id, data);
      else await createWebhook(instanceId, data);
      qc.invalidateQueries({ queryKey: ["webhooks", instanceId] });
      toast({ title: webhook ? "Webhook saved" : "Webhook added" });
      onDone();
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; details?: { path: string; message: string }[] } } }).response?.data;
      const detail = resp?.details?.map((d) => `${d.path}: ${d.message}`).join("; ");
      toast({ title: "Failed to save", description: detail || resp?.error, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSecret() {
    if (!webhook) return;
    await deleteWebhookSecret(instanceId, webhook.id);
    qc.invalidateQueries({ queryKey: ["webhooks", instanceId] });
    toast({ title: "Signing secret removed" });
  }

  return (
    <form onSubmit={handleSave} className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <p className="font-medium">{webhook ? "Edit webhook" : "New webhook"}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}><X className="h-4 w-4" /></Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input placeholder="e.g. n8n agent" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Endpoint URL</Label>
          <Input placeholder="https://yourapp.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
      </div>

      {/* Events */}
      <div className="space-y-3">
        <Label>Events <span className="text-xs text-muted-foreground font-normal">(none ticked = all events)</span></Label>
        <div className="space-y-4">
          {EVENT_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.events.map((ev) => (
                  <label key={ev.id} className="flex items-start gap-3 cursor-pointer rounded-md border bg-background p-2.5 hover:bg-muted/50 transition-colors">
                    <input type="checkbox" checked={events.includes(ev.id)} onChange={() => toggleEvent(ev.id)} className="mt-0.5 rounded border" />
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

      {/* Filters */}
      {receivesMessages && (
        <MessageFilters instanceId={instanceId} filters={filters} onChange={setFilters} sendersText={sendersText} onSendersText={setSendersText} />
      )}

      {/* Secret */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>
            Signing secret{" "}
            {webhook?.hasSecret && <span className="text-xs text-muted-foreground font-normal">(set — enter new to rotate)</span>}
          </Label>
          {webhook?.hasSecret && (
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive" onClick={handleRemoveSecret}>
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          )}
        </div>
        <Input
          type="password"
          placeholder={webhook?.hasSecret ? "Leave empty to keep current" : "Optional — min 8 characters"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          minLength={secret ? 8 : undefined}
        />
        <p className="text-xs text-muted-foreground">
          When set, each request includes an <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> header you can verify with HMAC-SHA256.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : webhook ? "Save" : "Add webhook"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function MessageFilters({
  instanceId, filters, onChange, sendersText, onSendersText,
}: {
  instanceId: string;
  filters: WebhookFilters;
  onChange: (f: WebhookFilters) => void;
  sendersText: string;
  onSendersText: (s: string) => void;
}) {
  const [groupQuery, setGroupQuery] = useState("");
  const { data: groups = [], isError } = useQuery({
    queryKey: ["groups", instanceId],
    queryFn: () => listGroups(instanceId).then((r) => r.data),
    retry: false,
    staleTime: 60_000,
  });
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name || g.id])), [groups]);
  const matches = groups
    .filter((g) => !filters.groups.includes(g.id))
    .filter((g) => !groupQuery || (g.name ?? "").toLowerCase().includes(groupQuery.toLowerCase()) || g.id.includes(groupQuery))
    .slice(0, 8);

  const set = (patch: Partial<WebhookFilters>) => onChange({ ...filters, ...patch });
  const addGroup = (id: string) => { set({ groups: [...filters.groups, id] }); setGroupQuery(""); };

  return (
    <div className="space-y-4 rounded-md border bg-background p-3">
      <div>
        <p className="text-sm font-medium flex items-center gap-1.5"><Filter className="h-4 w-4" /> Message filters</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Only incoming messages that match all of these are sent to this webhook. Other events are not filtered.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Chats</Label>
        <div className="flex flex-wrap gap-3 text-sm">
          {([["all", "All chats"], ["groups", "Groups only"], ["direct", "Direct chats only"]] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="chatTypes" checked={filters.chatTypes === v} onChange={() => set({ chatTypes: v })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {filters.chatTypes !== "direct" && (
        <div className="space-y-1.5">
          <Label>Only these groups <span className="text-xs text-muted-foreground font-normal">(none = every group)</span></Label>
          {filters.groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filters.groups.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
                  {groupName.get(id) ?? id}
                  <button type="button" onClick={() => set({ groups: filters.groups.filter((g) => g !== id) })} aria-label="Remove group">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            placeholder={isError ? "Group ID, e.g. 120363…@g.us (connect the instance to pick by name)" : "Search groups by name, or paste a group ID"}
            value={groupQuery}
            onChange={(e) => setGroupQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const q = groupQuery.trim();
                if (/@g\.us$/.test(q) && !filters.groups.includes(q)) addGroup(q);
                else if (matches[0]) addGroup(matches[0].id);
              }
            }}
          />
          {groupQuery && matches.length > 0 && (
            <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
              {matches.map((g) => (
                <button key={g.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted" onClick={() => addGroup(g.id)}>
                  {g.name || g.id} <span className="text-xs text-muted-foreground">· {g.participantCount} members</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Only from these senders <span className="text-xs text-muted-foreground font-normal">(none = anyone)</span></Label>
        <textarea
          className="w-full min-h-[64px] rounded-md border bg-background px-3 py-2 text-sm"
          placeholder={"Phone numbers with country code, one per line\n919876543210"}
          value={sendersText}
          onChange={(e) => onSendersText(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-2 cursor-pointer text-sm">
        <input type="checkbox" className="mt-0.5" checked={filters.mentionsOnly} onChange={(e) => set({ mentionsOnly: e.target.checked })} />
        <span>
          Only when this WhatsApp number is tagged
          <span className="block text-xs text-muted-foreground">e.g. for a bot that should react only to @mentions</span>
        </span>
      </label>
    </div>
  );
}

// ── Delivery log ───────────────────────────────────────────────────────────────

function DeliveryLog({ instanceId, webhooks }: { instanceId: string; webhooks: Webhook[] }) {
  const names = new Map(webhooks.map((w) => [w.id, w.name || w.url]));
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
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Webhook</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Event</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Duration</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow key={log.id} log={log} webhookName={(log.webhook_id && names.get(log.webhook_id)) || log.url} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRow({ log, webhookName }: { log: WebhookLog; webhookName: string }) {
  const ok = log.status_code !== null && log.status_code >= 200 && log.status_code < 300;
  const statusColor = log.status_code === null
    ? "text-muted-foreground"
    : ok
    ? "text-green-600 font-medium"
    : "text-red-600 font-medium";

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-4 py-2 text-xs max-w-[160px] truncate" title={log.url}>{webhookName}</td>
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
