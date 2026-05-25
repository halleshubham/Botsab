import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Phone, ChevronRight, X, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listContactLists,
  getContactList,
  createContactList,
  deleteContactList,
  addContactListMembers,
  deleteContactListMember,
  type ContactList,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export function ContactLists() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const { data: lists = [] } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => listContactLists().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const { data: detail } = useQuery({
    queryKey: ["contact-list", selectedId],
    queryFn: () => getContactList(selectedId!).then((r) => r.data),
    enabled: !!selectedId,
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreating(true);
    try {
      await createContactList(newListName.trim(), newListDesc.trim() || undefined);
      setNewListName("");
      setNewListDesc("");
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
      toast({ title: "List created" });
    } catch {
      toast({ title: "Failed to create list", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteContactList(id);
    if (selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["contact-lists"] });
    toast({ title: "List deleted" });
  }

  async function handleAddSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !addInput.trim()) return;
    const num = addInput.replace(/\D/g, "");
    if (!num) return;
    setAdding(true);
    try {
      const { data } = await addContactListMembers(selectedId, [
        { phone_number: num, label: addLabel.trim() || undefined },
      ]);
      setAddInput("");
      setAddLabel("");
      qc.invalidateQueries({ queryKey: ["contact-list", selectedId] });
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
      toast({ title: `Added ${data.added}, skipped ${data.skipped}` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleBulkImport() {
    if (!selectedId || !bulkText.trim()) return;
    const lines = bulkText
      .split(/[\n,;]+/)
      .map((l) => l.replace(/\D/g, ""))
      .filter((l) => l.length >= 7 && l.length <= 15);
    if (lines.length === 0) {
      toast({ title: "No valid numbers found", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { data } = await addContactListMembers(
        selectedId,
        lines.map((p) => ({ phone_number: p }))
      );
      setBulkText("");
      setShowBulk(false);
      qc.invalidateQueries({ queryKey: ["contact-list", selectedId] });
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
      toast({ title: `Imported ${data.added} numbers, ${data.skipped} duplicates skipped` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedId) return;
    await deleteContactListMember(selectedId, memberId);
    qc.invalidateQueries({ queryKey: ["contact-list", selectedId] });
    qc.invalidateQueries({ queryKey: ["contact-lists"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Contact Lists</h1>
        <p className="text-muted-foreground">Manage lists of phone numbers for bulk messaging</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create list</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. VIP customers"
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
                  {lists.map((l: ContactList) => (
                    <div
                      key={l.id}
                      className={`flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors ${
                        selectedId === l.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedId(l.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="text-xs text-muted-foreground">{l.memberCount} numbers</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(l.id); }}
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

        {/* Right panel */}
        {selectedId && detail ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{detail.name}</CardTitle>
                  <Badge variant="secondary">{detail.memberCount} numbers</Badge>
                </div>
                {detail.description && (
                  <p className="text-sm text-muted-foreground">{detail.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add single */}
                <form onSubmit={handleAddSingle} className="flex gap-2">
                  <Input
                    placeholder="Phone number (digits only, e.g. 919607459969)"
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Label (optional)"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className="w-36"
                  />
                  <Button type="submit" size="sm" disabled={adding}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </form>

                {/* Bulk import toggle */}
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowBulk((v) => !v)}
                  >
                    <Upload className="h-4 w-4" />
                    {showBulk ? "Hide" : "Bulk import"}
                  </Button>
                  {showBulk && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        className="w-full h-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder={"One number per line (or comma-separated)\n919607459969\n917654321000\n..."}
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                      />
                      <Button size="sm" disabled={adding} onClick={handleBulkImport}>
                        Import {bulkText.split(/[\n,;]+/).filter((l) => l.replace(/\D/g, "").length >= 7).length} numbers
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Members table */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Members</CardTitle></CardHeader>
              <CardContent className="p-0">
                {detail.members.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No members yet. Add numbers above.</p>
                ) : (
                  <div className="divide-y max-h-[480px] overflow-y-auto">
                    {detail.members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <span className="font-mono text-sm">{m.phone_number}</span>
                          {m.label && (
                            <span className="ml-2 text-xs text-muted-foreground">{m.label}</span>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
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
            Select a list to manage its members
          </div>
        )}
      </div>
    </div>
  );
}
