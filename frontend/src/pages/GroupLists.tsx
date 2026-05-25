import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users, ChevronRight, X, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listInstances,
  listGroups,
  listGroupLists,
  getGroupList,
  createGroupList,
  deleteGroupList,
  addGroupListMembers,
  deleteGroupListMember,
  type Group,
  type GroupList,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export function GroupLists() {
  const qc = useQueryClient();

  // Left panel state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Group picker state
  const [pickerInstance, setPickerInstance] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Existing lists
  const { data: lists = [] } = useQuery({
    queryKey: ["group-lists"],
    queryFn: () => listGroupLists().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });

  // Detail of selected list
  const { data: detail } = useQuery({
    queryKey: ["group-list", selectedId],
    queryFn: () => getGroupList(selectedId!).then((r) => r.data),
    enabled: !!selectedId,
  });

  // Connected instances for the picker
  const { data: instances = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });
  const connectedInstances = instances.filter((i) => i.status === "connected");

  // Live groups from the picked instance (exclude announce-only = admin-only)
  const { data: liveGroups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ["groups", pickerInstance],
    queryFn: () => listGroups(pickerInstance).then((r) => r.data),
    enabled: !!pickerInstance,
    select: (d) => Array.isArray(d) ? d : [],
  });

  // Sendable groups: exclude announce (only admins can post)
  const sendableGroups = useMemo(
    () => liveGroups.filter((g) => !g.announce),
    [liveGroups]
  );

  // Already-in-list JIDs for duplicate highlighting
  const existingJids = useMemo(
    () => new Set((detail?.members ?? []).map((m) => m.group_jid)),
    [detail]
  );

  // Filtered by search, excluding already-added groups
  const filteredGroups = useMemo(() => {
    const q = groupSearch.toLowerCase();
    return sendableGroups.filter(
      (g) => !existingJids.has(g.id) && (q === "" || (g.name ?? "").toLowerCase().includes(q))
    );
  }, [sendableGroups, groupSearch, existingJids]);

  const allSelected =
    filteredGroups.length > 0 && filteredGroups.every((g) => selectedJids.has(g.id));

  function handleSelectAll() {
    if (allSelected) {
      setSelectedJids(new Set());
    } else {
      setSelectedJids(new Set(filteredGroups.map((g) => g.id)));
    }
  }

  function toggleJid(jid: string) {
    setSelectedJids((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) next.delete(jid);
      else next.add(jid);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreating(true);
    try {
      await createGroupList(newListName.trim(), newListDesc.trim() || undefined);
      setNewListName("");
      setNewListDesc("");
      qc.invalidateQueries({ queryKey: ["group-lists"] });
      toast({ title: "List created" });
    } catch {
      toast({ title: "Failed to create list", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteList(id: string) {
    await deleteGroupList(id);
    if (selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["group-lists"] });
    toast({ title: "List deleted" });
  }

  async function handleAddSelected() {
    if (!selectedId || selectedJids.size === 0) return;
    const members = Array.from(selectedJids).map((jid) => {
      const g = sendableGroups.find((x) => x.id === jid);
      return { group_jid: jid, label: g?.name };
    });
    setAdding(true);
    try {
      const { data } = await addGroupListMembers(selectedId, members);
      setSelectedJids(new Set());
      qc.invalidateQueries({ queryKey: ["group-list", selectedId] });
      qc.invalidateQueries({ queryKey: ["group-lists"] });
      toast({ title: `Added ${data.added} groups${data.skipped > 0 ? `, ${data.skipped} already in list` : ""}` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedId) return;
    await deleteGroupListMember(selectedId, memberId);
    qc.invalidateQueries({ queryKey: ["group-list", selectedId] });
    qc.invalidateQueries({ queryKey: ["group-lists"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Group Lists</h1>
        <p className="text-muted-foreground">Manage lists of WhatsApp groups for bulk messaging</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Left panel ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create list</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. Marketing groups"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Short description"
                    value={newListDesc}
                    onChange={(e) => setNewListDesc(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" disabled={creating} className="w-full">
                  <Plus className="h-4 w-4" /> Create
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Your lists</CardTitle></CardHeader>
            <CardContent className="p-0">
              {lists.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No lists yet.</p>
              ) : (
                <div className="divide-y">
                  {lists.map((l: GroupList) => (
                    <div
                      key={l.id}
                      className={`flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors ${
                        selectedId === l.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedId(l.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="text-xs text-muted-foreground">{l.memberCount} groups</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteList(l.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right panel ── */}
        {selectedId && detail ? (
          <div className="space-y-4">
            {/* Group picker */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{detail.name}</CardTitle>
                  <Badge variant="secondary">{detail.memberCount} groups</Badge>
                </div>
                {detail.description && (
                  <p className="text-sm text-muted-foreground">{detail.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Instance selector */}
                <div className="space-y-1">
                  <Label>Load groups from instance</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={pickerInstance}
                    onChange={(e) => {
                      setPickerInstance(e.target.value);
                      setSelectedJids(new Set());
                      setGroupSearch("");
                    }}
                  >
                    <option value="">— select a connected instance —</option>
                    {connectedInstances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.slug} ({i.phoneNumber ?? i.id})
                      </option>
                    ))}
                  </select>
                  {connectedInstances.length === 0 && (
                    <p className="text-xs text-muted-foreground">No connected instances found.</p>
                  )}
                </div>

                {pickerInstance && (
                  <>
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search groups…"
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>

                    {/* Select-all row + count */}
                    {!loadingGroups && (
                      <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={allSelected}
                            onChange={handleSelectAll}
                          />
                          <span>
                            {allSelected ? "Deselect all" : "Select all"}{" "}
                            <span className="text-muted-foreground">({filteredGroups.length} sendable)</span>
                          </span>
                        </label>
                        {selectedJids.size > 0 && (
                          <span className="text-muted-foreground">{selectedJids.size} selected</span>
                        )}
                      </div>
                    )}

                    {/* Group list */}
                    <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                      {loadingGroups ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading groups…
                        </div>
                      ) : filteredGroups.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                          {groupSearch
                            ? "No groups match your search."
                            : "All sendable groups are already in this list."}
                        </p>
                      ) : (
                        filteredGroups.map((g: Group) => (
                          <label
                            key={g.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-input"
                              checked={selectedJids.has(g.id)}
                              onChange={() => toggleJid(g.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{g.name}</p>
                              <p className="text-xs text-muted-foreground font-mono truncate">{g.id}</p>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                              <Users className="h-3 w-3" />
                              {g.participantCount}
                            </Badge>
                          </label>
                        ))
                      )}
                    </div>

                    {/* Announce-only info */}
                    {!loadingGroups && liveGroups.some((g) => g.announce) && (
                      <p className="text-xs text-muted-foreground">
                        {liveGroups.filter((g) => g.announce).length} admin-only group
                        {liveGroups.filter((g) => g.announce).length !== 1 ? "s" : ""} hidden
                        (your account cannot send messages there).
                      </p>
                    )}

                    <Button
                      size="sm"
                      disabled={selectedJids.size === 0 || adding}
                      onClick={handleAddSelected}
                    >
                      {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                      Add {selectedJids.size > 0 ? `${selectedJids.size} group${selectedJids.size !== 1 ? "s" : ""}` : "selected"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Members table */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Groups in this list</CardTitle></CardHeader>
              <CardContent className="p-0">
                {detail.members.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No groups yet. Pick from an instance above.</p>
                ) : (
                  <div className="divide-y max-h-[480px] overflow-y-auto">
                    {detail.members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          {m.label && (
                            <p className="text-sm font-medium truncate">{m.label}</p>
                          )}
                          <span className="font-mono text-xs text-muted-foreground truncate">{m.group_jid}</span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(m.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed h-64 text-muted-foreground text-sm">
            Select a list to manage its groups
          </div>
        )}
      </div>
    </div>
  );
}
