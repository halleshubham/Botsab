import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Users, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listInstances, listGroups, type Group } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export function Groups() {
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: instances = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
  });

  const connectedInstances = instances.filter((i) => i.status === "connected");

  const { data: groups = [], isLoading, isFetching } = useQuery({
    queryKey: ["groups", selectedInstance],
    queryFn: () => listGroups(selectedInstance).then((r) => r.data),
    enabled: !!selectedInstance,
  });

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.id.toLowerCase().includes(search.toLowerCase())
  );

  async function copyId(id: string) {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast({ title: "Copied", description: id });
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Groups</h1>
        <p className="text-muted-foreground">Browse groups and copy their IDs for API use</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Instance</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedInstance}
              onChange={(e) => { setSelectedInstance(e.target.value); setSearch(""); }}
            >
              <option value="">— select a connected instance —</option>
              {connectedInstances.map((i) => (
                <option key={i.id} value={i.id}>{i.slug} ({i.phoneNumber ?? i.id})</option>
              ))}
            </select>
            {connectedInstances.length === 0 && (
              <p className="text-xs text-muted-foreground">No connected instances. Connect one on the Instances page first.</p>
            )}
          </div>

          {selectedInstance && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by name or group ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && selectedInstance && (
        <p className="text-muted-foreground text-sm">Loading groups…</p>
      )}

      {!isLoading && selectedInstance && groups.length === 0 && (
        <p className="text-muted-foreground text-sm">No groups found for this instance.</p>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g: Group) => (
            <Card key={g.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{g.name}</CardTitle>
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Users className="h-3 w-3" />
                    {g.participantCount}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>
                )}
                <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5">
                  <code className="flex-1 truncate text-xs font-mono text-muted-foreground">{g.id}</code>
                  <button
                    onClick={() => copyId(g.id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy group ID"
                  >
                    {copiedId === g.id
                      ? <Check className="h-3.5 w-3.5 text-green-500" />
                      : <Copy className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
                {g.createdAt && (
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(g.createdAt).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isFetching && !isLoading && (
        <p className="text-xs text-muted-foreground">Refreshing…</p>
      )}
    </div>
  );
}
