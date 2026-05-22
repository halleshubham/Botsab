import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listKeys, createKey, revokeKey } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export function ApiKeys() {
  const qc = useQueryClient();
  const { data: keys = [] } = useQuery({ queryKey: ["keys"], queryFn: () => listKeys().then((r) => r.data) });
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ key: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    try {
      const { data } = await createKey(label.trim());
      setNewKey(data);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["keys"] });
    } catch {
      toast({ title: "Failed to create key", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    await revokeKey(id);
    qc.invalidateQueries({ queryKey: ["keys"] });
    toast({ title: "Key revoked" });
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">API Keys</h1>
        <p className="text-muted-foreground">Keys are shown only once at creation time</p>
      </div>

      {/* New key shown once */}
      {newKey && (
        <Card className="border-primary">
          <CardHeader><CardTitle className="text-base text-primary">New key created — copy it now!</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm"><strong>{newKey.label}</strong></p>
            <div className="flex gap-2">
              <Input readOnly value={newKey.key} className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => copyKey(newKey.key)}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setNewKey(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Create API key</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="label">Label</Label>
              <Input id="label" placeholder="e.g. production, dev" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                <Plus className="h-4 w-4" /> Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Keys table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Active keys</CardTitle></CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active keys.</p>
          ) : (
            <div className="divide-y">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{k.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(k.createdAt).toLocaleDateString()}
                      {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => handleRevoke(k.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
