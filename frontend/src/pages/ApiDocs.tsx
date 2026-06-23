import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, ChevronDown, ChevronRight, BookOpen, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listInstances, listKeys, listGroups, type ApiKey, type Group } from "@/lib/api";

// ─── types ───────────────────────────────────────────────────────────────────

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  curl: (ctx: CurlCtx) => string;
}

interface Section {
  title: string;
  endpoints: Endpoint[];
}

interface CurlCtx {
  apiKey: string;
  instanceId: string;
  groupId: string;
  base: string;
}

// ─── endpoint definitions ─────────────────────────────────────────────────────

function buildSections(ctx: CurlCtx): Section[] {
  const h = `-H "x-api-key: ${ctx.apiKey}"`;
  const j = `-H "Content-Type: application/json"`;
  const b = ctx.base;
  const id = ctx.instanceId;
  const gid = ctx.groupId;

  return [
    {
      title: "Auth",
      endpoints: [
        {
          method: "POST", path: "/auth/register",
          description: "Create a new account. Returns an API key — shown only once.",
          curl: () =>
            `curl -X POST ${b}/auth/register \\\n  ${j} \\\n  -d '{"email":"you@example.com","password":"yourpassword"}'`,
        },
        {
          method: "POST", path: "/auth/login",
          description: "Sign in with email and password.",
          curl: () =>
            `curl -X POST ${b}/auth/login \\\n  ${j} \\\n  -d '{"email":"you@example.com","password":"yourpassword"}'`,
        },
      ],
    },
    {
      title: "API Keys",
      endpoints: [
        {
          method: "GET", path: "/keys",
          description: "List all active (non-revoked) API keys for your account.",
          curl: () => `curl ${b}/keys \\\n  ${h}`,
        },
        {
          method: "POST", path: "/keys",
          description: "Create a new API key. The raw key is returned only once.",
          curl: () =>
            `curl -X POST ${b}/keys \\\n  ${h} \\\n  ${j} \\\n  -d '{"label":"production"}'`,
        },
        {
          method: "DELETE", path: "/keys/:keyId",
          description: "Revoke an API key permanently.",
          curl: () => `curl -X DELETE ${b}/keys/KEY_ID \\\n  ${h}`,
        },
      ],
    },
    {
      title: "Instances",
      endpoints: [
        {
          method: "GET", path: "/instances",
          description: "List all WhatsApp instances belonging to your account.",
          curl: () => `curl ${b}/instances \\\n  ${h}`,
        },
        {
          method: "POST", path: "/instances",
          description: "Create a new instance (does not connect yet). Slug must be lowercase alphanumeric.",
          curl: () =>
            `curl -X POST ${b}/instances \\\n  ${h} \\\n  ${j} \\\n  -d '{"slug":"main"}'`,
        },
        {
          method: "DELETE", path: "/instances/:instanceId",
          description: "Delete an instance and erase its session files.",
          curl: () => `curl -X DELETE ${b}/instances/${id} \\\n  ${h}`,
        },
      ],
    },
    {
      title: "Connection",
      endpoints: [
        {
          method: "POST", path: "/instances/:instanceId/connect",
          description: "Start connecting. If no saved session exists, triggers QR generation.",
          curl: () => `curl -X POST ${b}/instances/${id}/connect \\\n  ${h}`,
        },
        {
          method: "GET", path: "/instances/:instanceId/qr",
          description: "Get the current QR code as a base64 PNG. Poll every 5s while status is qr_pending.",
          curl: () => `curl ${b}/instances/${id}/qr \\\n  ${h}`,
        },
        {
          method: "GET", path: "/instances/:instanceId/events",
          description: "Server-Sent Events stream — pushes qr, connection.open, connection.close, message.received in real time.",
          curl: () =>
            `curl -N "${b}/instances/${id}/events?x-api-key=${ctx.apiKey}"`,
        },
        {
          method: "POST", path: "/instances/:instanceId/disconnect",
          description: "Gracefully disconnect without erasing the session (can reconnect without scanning QR again).",
          curl: () => `curl -X POST ${b}/instances/${id}/disconnect \\\n  ${h}`,
        },
        {
          method: "POST", path: "/instances/:instanceId/logout",
          description: "Log out from WhatsApp and erase all session files.",
          curl: () => `curl -X POST ${b}/instances/${id}/logout \\\n  ${h}`,
        },
      ],
    },
    {
      title: "Messages",
      endpoints: [
        {
          method: "POST", path: "/instances/:instanceId/messages/send — text",
          description: "Send a text message. JID format: {phone}@s.whatsapp.net for DMs, {id}@g.us for groups.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/messages/send \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "to": "919876543210@s.whatsapp.net",\n    "type": "text",\n    "text": "Hello from Botsab!"\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/messages/send — image (URL)",
          description: "Send an image from a public URL with an optional caption. Use a @g.us JID to send to a group.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/messages/send \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "to": "919876543210@s.whatsapp.net",\n    "type": "image",\n    "url": "https://example.com/photo.jpg",\n    "caption": "Check this out!"\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/messages/send — image (fileId)",
          description: "Send an image using a fileId returned by POST /media/upload. Avoids re-uploading the same file for each send.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/messages/send \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "to": "919876543210@s.whatsapp.net",\n    "type": "image",\n    "fileId": "uuid-returned-by-upload.jpg",\n    "caption": "Check this out!"\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/messages/send — document",
          description: "Send a file as a document attachment.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/messages/send \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "to": "919876543210@s.whatsapp.net",\n    "type": "document",\n    "url": "https://example.com/report.pdf",\n    "filename": "report.pdf",\n    "mimetype": "application/pdf"\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/messages/sendBulk",
          description: "Send multiple messages with a configurable delay between each.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/messages/sendBulk \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "messages": [\n      {"to":"919876543210@s.whatsapp.net","type":"text","text":"First"},\n      {"to":"919876543211@s.whatsapp.net","type":"text","text":"Second"}\n    ],\n    "delayMs": 1000\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/messages/read",
          description: "Mark one or more messages as read (send read receipts).",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/messages/read \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "keys": [{\n      "remoteJid": "919876543210@s.whatsapp.net",\n      "id": "BAE5XXXXXXXX",\n      "fromMe": false\n    }]\n  }'`,
        },
      ],
    },
    {
      title: "Groups",
      endpoints: [
        {
          method: "GET", path: "/instances/:instanceId/groups",
          description: "List all groups the instance is a member of.",
          curl: () => `curl ${b}/instances/${id}/groups \\\n  ${h}`,
        },
        {
          method: "GET", path: "/instances/:instanceId/groups/:groupId",
          description: "Get full group metadata including all participants. Use the numeric group ID — omit the @g.us suffix from the URL.",
          curl: () =>
            `curl ${b}/instances/${id}/groups/${gid} \\\n  ${h}`,
        },
        {
          method: "POST", path: "/instances/:instanceId/groups/:groupId/send — text",
          description: "Send a text message to a group. Pass only the numeric group ID in the URL — do NOT include @g.us (it causes a 405 from the proxy). The server appends @g.us automatically.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/groups/${gid}/send \\\n  ${h} \\\n  ${j} \\\n  -d '{"type":"text","text":"Hello group!"}'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/groups/:groupId/send — image (URL)",
          description: "Send an image to a group from a public URL with an optional caption. Pass only the numeric group ID — omit @g.us.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/groups/${gid}/send \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "type": "image",\n    "url": "https://example.com/photo.jpg",\n    "caption": "Check this out!"\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/groups/:groupId/send — image (fileId)",
          description: "Send an image to a group using a fileId from POST /media/upload. Omit @g.us from the group ID.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/groups/${gid}/send \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "type": "image",\n    "fileId": "uuid-returned-by-upload.jpg",\n    "caption": "Check this out!"\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/groups",
          description: "Create a new group with given participants.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/groups \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "name": "My Group",\n    "participants": ["919876543210@s.whatsapp.net"]\n  }'`,
        },
        {
          method: "POST", path: "/instances/:instanceId/groups/:groupId/participants",
          description: "Add, remove, promote, or demote participants. Actions: add | remove | promote | demote. Use numeric group ID in the URL — omit @g.us.",
          curl: () =>
            `curl -X POST ${b}/instances/${id}/groups/${gid}/participants \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "action": "add",\n    "participants": ["919876543210@s.whatsapp.net"]\n  }'`,
        },
      ],
    },
    {
      title: "Media",
      endpoints: [
        {
          method: "POST", path: "/media/upload",
          description: "Upload an image file (max 16 MB). Returns a fileId you can pass as \"fileId\" in any send endpoint instead of a public URL.",
          curl: () =>
            `curl -X POST ${b}/media/upload \\\n  ${h} \\\n  -F "file=@/path/to/photo.jpg"`,
        },
      ],
    },
    {
      title: "Webhooks",
      endpoints: [
        {
          method: "GET", path: "/instances/:instanceId/webhook",
          description: "Get the current webhook configuration for an instance.",
          curl: () => `curl ${b}/instances/${id}/webhook \\\n  ${h}`,
        },
        {
          method: "PUT", path: "/instances/:instanceId/webhook",
          description: "Set the webhook URL, subscribed events, and optional HMAC signing secret.",
          curl: () =>
            `curl -X PUT ${b}/instances/${id}/webhook \\\n  ${h} \\\n  ${j} \\\n  -d '{\n    "url": "https://yourapp.com/webhook",\n    "events": ["message.received","connection.open","qr"],\n    "secret": "mysigningsecret"\n  }'`,
        },
      ],
    },
  ];
}

// ─── component ────────────────────────────────────────────────────────────────

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-blue-100 text-blue-800",
  POST:   "bg-green-100 text-green-800",
  PUT:    "bg-yellow-100 text-yellow-800",
  DELETE: "bg-red-100 text-red-800",
};

export function ApiDocs() {
  const { data: instances = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
  });
  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ["keys"],
    queryFn: () => listKeys().then((r) => r.data),
  });

  const [selectedInstance, setSelectedInstance] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [apiKeyValue, setApiKeyValue] = useState(localStorage.getItem("apiKey") ?? "");

  const [groupId, setGroupId] = useState("120363426420430486");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const groupDropRef = useRef<HTMLDivElement>(null);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ Instances: true, Messages: true, Groups: true });
  const [copied, setCopied] = useState<string | null>(null);

  const instanceId = selectedInstance || instances[0]?.id || "INSTANCE_ID";
  const base = window.location.origin;

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["api-docs-groups", instanceId],
    queryFn: () => listGroups(instanceId).then((r) => r.data),
    enabled: !!instanceId && instanceId !== "INSTANCE_ID",
  });

  const filteredGroups = groups.filter((g) =>
    (g.name ?? "").toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.id.replace("@g.us", "").includes(groupSearch)
  );
  const selectedGroupName = groups.find((g) => g.id.replace("@g.us", "") === groupId)?.name ?? undefined;

  // Close group dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (groupDropRef.current && !groupDropRef.current.contains(e.target as Node)) {
        setGroupDropOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Sync key label select → pre-fill value if it's the localStorage key
  function handleKeyLabelChange(keyId: string) {
    setSelectedKeyId(keyId);
    // If the user picks the key that matches the stored value (first key usually), keep the value
    // Otherwise clear it so they know to paste
    const storedKey = localStorage.getItem("apiKey") ?? "";
    const idx = apiKeys.findIndex((k) => k.id === keyId);
    if (idx === 0 && storedKey) {
      setApiKeyValue(storedKey);
    } else {
      setApiKeyValue("");
    }
  }

  const apiKey = apiKeyValue || "YOUR_API_KEY";
  const ctx: CurlCtx = { apiKey, instanceId, groupId, base };
  const sections = buildSections(ctx);

  function toggleSection(title: string) {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  function copyCode(code: string, key: string) {
    navigator.clipboard.writeText(code);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7" /> API Reference
        </h1>
        <p className="text-muted-foreground mt-1">All endpoints pre-filled with your credentials. Copy and run.</p>
      </div>

      {/* Context selectors */}
      <Card>
        <CardContent className="pt-5 grid gap-4 sm:grid-cols-3">
          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">API Key</label>
            {apiKeys.length > 0 && (
              <select
                value={selectedKeyId || apiKeys[0]?.id || ""}
                onChange={(e) => handleKeyLabelChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {apiKeys.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <input
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
                placeholder="Paste your API key here"
                className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => copyCode(apiKey, "apikey")}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {copied === "apikey" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Instance */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Instance</label>
            <select
              value={selectedInstance || instanceId}
              onChange={(e) => { setSelectedInstance(e.target.value); setGroupId(""); setGroupSearch(""); }}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {instances.length === 0 && <option value="INSTANCE_ID">INSTANCE_ID</option>}
              {instances.map((i) => (
                <option key={i.id} value={i.id}>{i.slug} ({i.status})</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{instanceId}</p>
          </div>

          {/* Group — searchable dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Group <span className="normal-case text-[10px] text-yellow-600">(numeric ID injected)</span>
            </label>
            <div className="relative" ref={groupDropRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={groupDropOpen ? groupSearch : (selectedGroupName || groupId)}
                  onChange={(e) => { setGroupSearch(e.target.value); setGroupDropOpen(true); }}
                  onFocus={() => { setGroupSearch(""); setGroupDropOpen(true); }}
                  placeholder={instanceId === "INSTANCE_ID" ? "Select an instance first" : "Search groups…"}
                  disabled={instanceId === "INSTANCE_ID"}
                  className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>
              {groupDropOpen && filteredGroups.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
                  {filteredGroups.map((g) => {
                    const numericId = g.id.replace("@g.us", "");
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setGroupId(numericId);
                          setGroupSearch("");
                          setGroupDropOpen(false);
                        }}
                        className="w-full flex flex-col items-start px-3 py-2 text-left hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-medium truncate w-full">{g.name || <span className="text-muted-foreground italic">unnamed</span>}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{numericId}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {groupDropOpen && instanceId !== "INSTANCE_ID" && filteredGroups.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg px-3 py-2 text-sm text-muted-foreground">
                  {groups.length === 0 ? "No groups loaded" : "No groups match"}
                </div>
              )}
            </div>
            {groupId && <p className="text-[10px] text-muted-foreground font-mono truncate">{groupId}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      {sections.map((section) => {
        const isOpen = openSections[section.title] ?? false;
        return (
          <div key={section.title} className="rounded-lg border overflow-hidden">
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/50 hover:bg-muted transition-colors text-left"
            >
              <span className="font-semibold">{section.title}</span>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span>{section.endpoints.length} endpoint{section.endpoints.length !== 1 ? "s" : ""}</span>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </button>

            {isOpen && (
              <div className="divide-y">
                {section.endpoints.map((ep, idx) => {
                  const curlText = ep.curl(ctx);
                  const copyKey = `${section.title}-${idx}`;
                  const methodLabel = ep.method;

                  return (
                    <div key={idx} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${METHOD_COLOR[methodLabel]}`}>
                          {methodLabel}
                        </span>
                        <code className="text-sm font-mono text-foreground break-all">{ep.path}</code>
                      </div>
                      <p className="text-sm text-muted-foreground">{ep.description}</p>
                      <div className="relative">
                        <pre className="rounded-md bg-zinc-950 text-zinc-100 text-xs p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                          {curlText}
                        </pre>
                        <button
                          onClick={() => copyCode(curlText, copyKey)}
                          className="absolute right-2 top-2 rounded p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                          title="Copy curl"
                        >
                          {copied === copyKey
                            ? <Check className="h-3.5 w-3.5 text-green-400" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Webhook payload reference */}
      <Card>
        <CardHeader><CardTitle className="text-base">Webhook payload envelope</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Every event POSTed to your webhook URL uses this structure. Verify authenticity with the{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Webhook-Signature: sha256=…</code> header.
          </p>
          <pre className="rounded-md bg-zinc-950 text-zinc-100 text-xs p-4 overflow-x-auto leading-relaxed">{`{
  "instanceId": "${instanceId}",
  "userId":     "uuid",
  "event":      "message.received",
  "timestamp":  1779473253,
  "data": { /* event-specific payload */ }
}

Supported events:
  qr               → data.qr (raw QR string)
  connection.open  → data.phone
  connection.close → data.statusCode, data.shouldReconnect
  message.received → data.message (full Baileys message object)
  message.receipt  → data.updates
  group.update     → data.updates
  contact.update   → data.updates`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
