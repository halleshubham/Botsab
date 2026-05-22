import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, WifiOff, QrCode, RefreshCw, LogOut, Send } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  listInstances, createInstance, deleteInstance,
  connectInstance, disconnectInstance, logoutInstance,
  sendMessage, type Instance,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  connected:    { label: "Connected",    variant: "success"   },
  qr_pending:   { label: "QR Pending",   variant: "warning"   },
  disconnected: { label: "Disconnected", variant: "secondary" },
};

export function Instances() {
  const qc = useQueryClient();
  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
    refetchInterval: 5000,
  });

  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // QR dialog state
  const [qrInstanceId, setQrInstanceId] = useState<string | null>(null);
  const [qrString, setQrString]         = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Quick send dialog state
  const [sendTarget, setSendTarget] = useState<Instance | null>(null);

  // Open QR dialog → subscribe SSE for that instance
  function openQrDialog(instanceId: string) {
    setQrInstanceId(instanceId);
    setQrString(null);
  }

  function closeQrDialog() {
    sseRef.current?.close();
    sseRef.current = null;
    setQrInstanceId(null);
    setQrString(null);
  }

  // Subscribe SSE whenever qrInstanceId changes
  useEffect(() => {
    if (!qrInstanceId) return;

    const apiKey = encodeURIComponent(localStorage.getItem("apiKey") ?? "");
    const es = new EventSource(`/instances/${qrInstanceId}/events?x-api-key=${apiKey}`);
    sseRef.current = es;

    es.addEventListener("qr", (e) => {
      const data = JSON.parse(e.data) as { qr: string };
      setQrString(data.qr);
    });

    es.addEventListener("connection.open", () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      closeQrDialog();
      toast({ title: "Connected!", description: "WhatsApp connected successfully." });
    });

    es.onerror = () => {
      // SSE dropped (auth fail or network); stop thrashing
      es.close();
      sseRef.current = null;
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrInstanceId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlug.trim()) return;
    setCreating(true);
    try {
      await createInstance(newSlug.trim());
      setNewSlug("");
      qc.invalidateQueries({ queryKey: ["instances"] });
      toast({ title: "Instance created" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleConnect(inst: Instance) {
    try {
      openQrDialog(inst.id);          // open dialog + start SSE first
      await connectInstance(inst.id); // then trigger connection
      qc.invalidateQueries({ queryKey: ["instances"] });
    } catch {
      closeQrDialog();
      toast({ title: "Connect failed", variant: "destructive" });
    }
  }

  async function handleDisconnect(id: string) {
    await disconnectInstance(id);
    qc.invalidateQueries({ queryKey: ["instances"] });
    toast({ title: "Disconnected" });
  }

  async function handleLogout(id: string) {
    await logoutInstance(id);
    qc.invalidateQueries({ queryKey: ["instances"] });
    toast({ title: "Logged out" });
  }

  async function handleDelete(id: string) {
    await deleteInstance(id);
    qc.invalidateQueries({ queryKey: ["instances"] });
    toast({ title: "Instance deleted" });
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Instances</h1>
        <p className="text-muted-foreground">Manage your WhatsApp connections</p>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader><CardTitle className="text-base">New instance</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="e.g. main, support, sales"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                pattern="^[a-z0-9_-]+$"
                title="Lowercase letters, numbers, hyphens and underscores only"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                <Plus className="h-4 w-4" /> Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Instance cards */}
      {instances.length === 0 ? (
        <p className="text-muted-foreground">No instances yet. Create one above.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instances.map((inst) => {
            const sb = STATUS_BADGE[inst.status] ?? STATUS_BADGE.disconnected;
            return (
              <Card key={inst.id}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{inst.slug}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{inst.phoneNumber ?? "No number"}</p>
                  </div>
                  <Badge variant={sb.variant}>{sb.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground font-mono truncate">{inst.id}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {inst.status === "disconnected" && (
                      <Button size="sm" onClick={() => handleConnect(inst)}>
                        <QrCode className="h-3.5 w-3.5" /> Connect
                      </Button>
                    )}
                    {inst.status === "qr_pending" && (
                      <Button size="sm" variant="outline" onClick={() => openQrDialog(inst.id)}>
                        <QrCode className="h-3.5 w-3.5" /> Show QR
                      </Button>
                    )}
                    {inst.status === "connected" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setSendTarget(inst)}>
                          <Send className="h-3.5 w-3.5" /> Send
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDisconnect(inst.id)}>
                          <WifiOff className="h-3.5 w-3.5" /> Disconnect
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleLogout(inst.id)}>
                          <LogOut className="h-3.5 w-3.5" /> Logout
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(inst.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* QR Dialog */}
      <Dialog open={!!qrInstanceId} onOpenChange={(open) => { if (!open) closeQrDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Open WhatsApp → Linked Devices → Link a Device
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrString ? (
              <div className="rounded-lg border p-3 bg-white">
                <QRCodeSVG value={qrString} size={240} />
              </div>
            ) : (
              <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-lg border bg-muted">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Waiting for QR…</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              QR refreshes automatically. Dialog closes when connected.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick send dialog */}
      {sendTarget && (
        <QuickSendDialog instance={sendTarget} onClose={() => setSendTarget(null)} />
      )}
    </div>
  );
}

function QuickSendDialog({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [to, setTo]     = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
      await sendMessage(instance.id, jid, text);
      toast({ title: "Message sent!" });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Send failed";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send message — {instance.slug}</DialogTitle>
          <DialogDescription>Send a text message from this instance</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-2">
            <Label>To (phone number or JID)</Label>
            <Input placeholder="1234567890 or 1234567890@s.whatsapp.net" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Hello!"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
