import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Save, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdminUsers, updateAdminUser, type AdminUser } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export function Admin() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listAdminUsers().then((r) => r.data),
  });

  // Track pending edits: { [userId]: newLimit }
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function handleSaveLimit(user: AdminUser) {
    const raw = edits[user.id];
    if (raw === undefined) return;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < -1) {
      toast({ title: "Invalid limit", description: "Enter a number ≥ 0, or -1 for unlimited.", variant: "destructive" });
      return;
    }
    setSaving((s) => ({ ...s, [user.id]: true }));
    try {
      await updateAdminUser(user.id, { instanceLimit: parsed });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEdits((e) => { const n = { ...e }; delete n[user.id]; return n; });
      toast({ title: "Updated", description: `${user.email} → limit ${parsed === -1 ? "unlimited" : parsed}` });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setSaving((s) => ({ ...s, [user.id]: false }));
    }
  }

  async function handleToggleRole(user: AdminUser) {
    const newRole = user.role === "superadmin" ? "user" : "superadmin";
    try {
      await updateAdminUser(user.id, { role: newRole });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Role updated", description: `${user.email} is now ${newRole}` });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  const myId = localStorage.getItem("userId");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-7 w-7" /> Admin
        </h1>
        <p className="text-muted-foreground">Manage user instance limits and roles</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instance limit legend</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><code className="text-foreground font-mono">0</code> — user cannot create any instances</p>
          <p><code className="text-foreground font-mono">N</code> — user can create up to N instances</p>
          <p><code className="text-foreground font-mono">-1</code> — unlimited (superadmin default)</p>
        </CardContent>
      </Card>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-center px-4 py-3 font-medium">Used</th>
              <th className="text-center px-4 py-3 font-medium w-44">Limit</th>
              <th className="px-4 py-3 font-medium w-32" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => {
              const isSelf = user.id === myId;
              const editVal = edits[user.id] ?? String(user.instanceLimit);
              const isDirty = edits[user.id] !== undefined && edits[user.id] !== String(user.instanceLimit);

              return (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {user.email}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.role === "superadmin" ? (
                        <Badge variant="warning" className="gap-1">
                          <Crown className="h-3 w-3" /> superadmin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">user</Badge>
                      )}
                      {!isSelf && (
                        <button
                          onClick={() => handleToggleRole(user)}
                          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        >
                          {user.role === "superadmin" ? "demote" : "promote"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {user.instanceCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-center">
                      <Input
                        type="number"
                        min={-1}
                        value={editVal}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [user.id]: e.target.value }))}
                        className="h-7 w-24 text-center tabular-nums"
                        disabled={isSelf}
                      />
                      {user.instanceLimit === -1 && editVal === "-1" && (
                        <span className="text-xs text-muted-foreground">∞</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant={isDirty ? "default" : "outline"}
                        disabled={!isDirty || saving[user.id]}
                        onClick={() => handleSaveLimit(user)}
                        className="gap-1"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving[user.id] ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="px-4 py-6 text-center text-muted-foreground">No users yet.</p>
        )}
      </div>
    </div>
  );
}
