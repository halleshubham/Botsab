import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listInstances, getWebhook, updateWebhook } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const ALL_EVENTS = ["qr", "connection.open", "connection.close", "message.received", "message.sent", "message.receipt", "group.update", "contact.update"] as const;

export function Webhooks() {
  const { data: instances = [] } = useQuery({ queryKey: ["instances"], queryFn: () => listInstances().then((r) => r.data) });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground">Configure outbound webhook callbacks per instance</p>
      </div>

      {instances.length === 0 && <p className="text-muted-foreground">No instances yet.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Instance selector */}
        <div className="space-y-2 lg:col-span-1">
          {instances.map((inst) => (
            <button
              key={inst.id}
              onClick={() => setSelected(inst.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${selected === inst.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
            >
              <p className="font-medium">{inst.slug}</p>
              <p className="text-xs text-muted-foreground">{inst.status}</p>
            </button>
          ))}
        </div>

        {/* Config panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <WebhookConfig instanceId={selected} />
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

function WebhookConfig({ instanceId }: { instanceId: string }) {
  const qc = useQueryClient();
  const { data: wh } = useQuery({
    queryKey: ["webhook", instanceId],
    queryFn: () => getWebhook(instanceId).then((r) => r.data),
  });

  const [url, setUrl] = useState(wh?.url ?? "");
  const [events, setEvents] = useState<string[]>(wh?.events ?? []);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync when data loads
  if (wh && url === "" && wh.url) setUrl(wh.url);
  if (wh && events.length === 0 && wh.events.length > 0) setEvents(wh.events);

  function toggleEvent(ev: string) {
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWebhook(instanceId, { url: url || null, events, ...(secret ? { secret } : {}) });
      qc.invalidateQueries({ queryKey: ["webhook", instanceId] });
      setSecret("");
      toast({ title: "Webhook saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Webhook configuration</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label>Endpoint URL</Label>
            <Input placeholder="https://yourapp.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} type="url" />
          </div>

          <div className="space-y-2">
            <Label>Events to subscribe</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="rounded border"
                  />
                  {ev}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Signing secret {wh?.hasSecret && <span className="text-xs text-muted-foreground">(already set — enter new to rotate)</span>}</Label>
            <Input type="password" placeholder="Leave empty to keep current" value={secret} onChange={(e) => setSecret(e.target.value)} minLength={8} />
          </div>

          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
