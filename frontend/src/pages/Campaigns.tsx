import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, ChevronDown, ChevronUp, RefreshCw, XCircle, CheckCircle, AlertCircle, Clock, Loader2, ImageIcon, Type, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listInstances,
  listContactLists,
  listGroupLists,
  listCampaigns,
  getCampaign,
  createCampaign,
  cancelCampaign,
  uploadMedia,
  type Campaign,
  type BulkCampaignOptions,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const STATUS_CONFIG = {
  pending:   { label: "Pending",   variant: "secondary" as const, icon: Clock },
  running:   { label: "Running",   variant: "default" as const,   icon: Loader2 },
  completed: { label: "Completed", variant: "default" as const,   icon: CheckCircle },
  failed:    { label: "Failed",    variant: "destructive" as const, icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "secondary" as const,  icon: XCircle },
} as const;

const DEFAULT_OPTS: BulkCampaignOptions = {
  minDelayMs: 4000,
  maxDelayMs: 10000,
  batchSize: 15,
  batchPauseMs: 60000,
  shuffle: true,
  appendSuffix: false,
  suffixType: "invisible",
  suffixLength: 4,
  sendTypingIndicator: true,
  markReadBeforeSend: true,
  maxRecipients: 50,
  sendStartHour: 8,
  sendEndHour: 21,
  dailyLimit: 150,
  checkNumberExists: true,
  respectOptOut: true,
};

const DEFAULT_GROUP_OPTS: BulkCampaignOptions = {
  minDelayMs: 180_000,
  maxDelayMs: 480_000,
  batchSize: 2,
  batchPauseMs: 2_700_000,
  shuffle: true,
  appendSuffix: false,
  suffixType: "invisible",
  suffixLength: 4,
  sendTypingIndicator: false,
  markReadBeforeSend: false,
  maxRecipients: 10,
  sendStartHour: 9,
  sendEndHour: 18,
  dailyLimit: 8,
  checkNumberExists: false,
  respectOptOut: true,
};

function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  if (total === 0) return null;
  const sentPct = Math.round((sent / total) * 100);
  const failPct = Math.round((failed / total) * 100);
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
      <div className="bg-green-500 h-full transition-all" style={{ width: `${sentPct}%` }} />
      <div className="bg-red-400 h-full transition-all" style={{ width: `${failPct}%` }} />
    </div>
  );
}

export function Campaigns() {
  const qc = useQueryClient();
  const [instanceId, setInstanceId] = useState("");
  const [listType, setListType] = useState<"contact" | "group">("contact");
  const [listId, setListId] = useState("");
  const [msgType, setMsgType] = useState<"text" | "image">("text");
  const [msgText, setMsgText] = useState("");
  const [msgVariants, setMsgVariants] = useState("");
  const [showVariants, setShowVariants] = useState(false);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgCaption, setImgCaption] = useState("");
  const [showCaptionVariants, setShowCaptionVariants] = useState(false);
  const [imgCaptionVariants, setImgCaptionVariants] = useState("");
  const [showOpts, setShowOpts] = useState(false);
  const [opts, setOpts] = useState<BulkCampaignOptions>({ ...DEFAULT_OPTS });
  const [creating, setCreating] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: instances = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });
  const connectedInstances = instances.filter((i) => i.status === "connected");

  const { data: contactLists = [] } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => listContactLists().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const { data: groupLists = [] } = useQuery({
    queryKey: ["group-lists"],
    queryFn: () => listGroupLists().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const { data: campaigns = [], refetch: refetchCampaigns } = useQuery({
    queryKey: ["campaigns", instanceId],
    queryFn: () => listCampaigns(instanceId).then((r) => r.data),
    enabled: !!instanceId,
    select: (d) => Array.isArray(d) ? d : [],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return (data as Campaign[]).some((c) => c.status === "running" || c.status === "pending") ? 3000 : false;
    },
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["campaign-detail", selectedCampaignId],
    queryFn: () => getCampaign(instanceId, selectedCampaignId!).then((r) => r.data),
    enabled: !!selectedCampaignId && !!instanceId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const d = data as { status: string };
      return d.status === "running" || d.status === "pending" ? 3000 : false;
    },
  });

  function setOpt<K extends keyof BulkCampaignOptions>(key: K, value: BulkCampaignOptions[K]) {
    setOpts((prev) => ({ ...prev, [key]: value }));
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImgFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImgPreview(url);
    } else {
      setImgPreview(null);
    }
  }

  function clearImage() {
    setImgFile(null);
    setImgPreview(null);
    setImgCaptionVariants("");
    setShowCaptionVariants(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!instanceId || !listId) return;
    if (msgType === "text" && !msgText.trim()) return;
    if (msgType === "image" && !imgFile) return;
    setCreating(true);
    try {
      let message: Record<string, unknown>;
      if (msgType === "image") {
        const { data: uploaded } = await uploadMedia(imgFile!);
        const captionVariants = showCaptionVariants
          ? [imgCaption.trim(), ...imgCaptionVariants.split("\n").map((s) => s.trim()).filter(Boolean)].filter(Boolean)
          : undefined;
        message = {
          type: "image",
          fileId: uploaded.fileId,
          mimeType: uploaded.mimeType,
          caption: imgCaption.trim() || undefined,
          ...(captionVariants && captionVariants.length > 0 ? { captionVariants } : {}),
        };
      } else {
        const variants = showVariants
          ? [msgText.trim(), ...msgVariants.split("\n").map((s) => s.trim()).filter(Boolean)]
          : undefined;
        message = { type: "text", text: msgText.trim(), ...(variants ? { variants } : {}) };
      }
      const { data } = await createCampaign(instanceId, {
        list_type: listType,
        list_id: listId,
        message,
        options: opts,
      });
      setMsgText("");
      setMsgVariants("");
      clearImage();
      setImgCaption("");
      setImgCaptionVariants("");
      setShowCaptionVariants(false);
      qc.invalidateQueries({ queryKey: ["campaigns", instanceId] });
      setSelectedCampaignId(data.id);
      toast({ title: "Campaign started", description: `ID: ${data.id.slice(0, 8)}…` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel(campaignId: string) {
    try {
      await cancelCampaign(instanceId, campaignId);
      toast({ title: "Cancel signal sent" });
      refetchCampaigns();
    } catch {
      toast({ title: "Failed to cancel", variant: "destructive" });
    }
  }

  const availableLists = listType === "contact" ? contactLists : groupLists;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Campaigns</h1>
        <p className="text-muted-foreground">Send messages to contact or group lists with anti-blocking controls</p>
      </div>

      {/* New campaign form */}
      <Card>
        <CardHeader><CardTitle className="text-base">New Campaign</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            {/* Row 1: instance + list type + list */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Instance</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={instanceId}
                  onChange={(e) => { setInstanceId(e.target.value); setSelectedCampaignId(null); }}
                >
                  <option value="">— select —</option>
                  {connectedInstances.map((i) => (
                    <option key={i.id} value={i.id}>{i.slug}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>List type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={listType}
                  onChange={(e) => {
                    const t = e.target.value as "contact" | "group";
                    setListType(t);
                    setListId("");
                    setOpts(t === "group" ? { ...DEFAULT_GROUP_OPTS } : { ...DEFAULT_OPTS });
                  }}
                >
                  <option value="contact">Contact list</option>
                  <option value="group">Group list</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>List</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                >
                  <option value="">— select —</option>
                  {availableLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.memberCount})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Group-mode banner */}
            {listType === "group" && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600" />
                <span>
                  <strong>Group mode:</strong> conservative defaults applied — 3–8 min between sends, batch of 2, max 8 groups/day.
                  Images are re-encoded per send to avoid hash-based detection.
                </span>
              </div>
            )}

            {/* Message type toggle */}
            <div className="space-y-2">
              <Label>Message type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMsgType("text")}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    msgType === "text" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <Type className="h-3.5 w-3.5" /> Text
                </button>
                <button
                  type="button"
                  onClick={() => setMsgType("image")}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    msgType === "image" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Image
                </button>
              </div>
            </div>

            {msgType === "text" ? (
              <>
                {/* Message */}
                <div className="space-y-1">
                  <Label>Message</Label>
                  <textarea
                    className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Type your message…"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    maxLength={4096}
                  />
                  <p className="text-xs text-muted-foreground text-right">{msgText.length}/4096</p>
                </div>

                {/* Message variants */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showVariants}
                      onChange={(e) => setShowVariants(e.target.checked)}
                    />
                    <span>Add message variants <span className="text-muted-foreground">(each recipient gets a random version — reduces duplicate-message flags)</span></span>
                  </label>
                  {showVariants && (
                    <textarea
                      className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder={"One alternative message per line:\nHey, saw you were interested!\nHi there, quick message for you…"}
                      value={msgVariants}
                      onChange={(e) => setMsgVariants(e.target.value)}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Image upload */}
                <div className="space-y-2">
                  <Label>Image file <span className="text-xs text-muted-foreground font-normal">(JPEG, PNG, WebP — max 16 MB)</span></Label>
                  {imgPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imgPreview}
                        alt="preview"
                        className="max-h-48 rounded-md border object-contain"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border transition-colors hover:border-primary/60"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="h-8 w-8 text-muted-foreground mb-1" />
                      <p className="text-sm text-muted-foreground">Click to select image</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>

                {/* Caption */}
                <div className="space-y-1">
                  <Label>Caption <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                  <textarea
                    className="w-full h-16 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Add a caption to your image…"
                    value={imgCaption}
                    onChange={(e) => setImgCaption(e.target.value)}
                    maxLength={1024}
                  />
                  <p className="text-xs text-muted-foreground text-right">{imgCaption.length}/1024</p>
                </div>

                {/* Caption variants */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showCaptionVariants}
                      onChange={(e) => setShowCaptionVariants(e.target.checked)}
                    />
                    <span>Add caption variants <span className="text-muted-foreground">(each send picks a random caption — reduces duplicate-message flags)</span></span>
                  </label>
                  {showCaptionVariants && (
                    <textarea
                      className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder={"One alternative caption per line:\nCheck this out!\nDon't miss this deal!"}
                      value={imgCaptionVariants}
                      onChange={(e) => setImgCaptionVariants(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {/* Advanced options toggle */}
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowOpts((v) => !v)}
              >
                {showOpts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Advanced anti-blocking options
              </button>

              {showOpts && (
                <div className="mt-3 rounded-lg border p-4 space-y-3 bg-muted/30">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Max recipients (hard cap: 200)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={opts.maxRecipients}
                        onChange={(e) => setOpt("maxRecipients", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Min delay between msgs (ms) — now: {fmtMs(opts.minDelayMs)}</Label>
                      <Input
                        type="number"
                        min={1000}
                        max={900_000}
                        step={1000}
                        value={opts.minDelayMs}
                        onChange={(e) => setOpt("minDelayMs", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max delay between msgs (ms) — now: {fmtMs(opts.maxDelayMs)}</Label>
                      <Input
                        type="number"
                        min={1000}
                        max={1_800_000}
                        step={1000}
                        value={opts.maxDelayMs}
                        onChange={(e) => setOpt("maxDelayMs", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Batch size</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={opts.batchSize}
                        onChange={(e) => setOpt("batchSize", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Batch pause (ms) — now: {fmtMs(opts.batchPauseMs)}</Label>
                      <Input
                        type="number"
                        min={10000}
                        max={7_200_000}
                        step={10000}
                        value={opts.batchPauseMs}
                        onChange={(e) => setOpt("batchPauseMs", Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.shuffle}
                        onChange={(e) => setOpt("shuffle", e.target.checked)}
                      />
                      Randomise send order
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.sendTypingIndicator}
                        onChange={(e) => setOpt("sendTypingIndicator", e.target.checked)}
                      />
                      Simulate typing
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.markReadBeforeSend}
                        onChange={(e) => setOpt("markReadBeforeSend", e.target.checked)}
                      />
                      Mark chat as read before send
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.appendSuffix}
                        onChange={(e) => setOpt("appendSuffix", e.target.checked)}
                      />
                      Append unique suffix
                    </label>
                    {opts.appendSuffix && (
                      <div className="flex items-center gap-2">
                        <select
                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                          value={opts.suffixType}
                          onChange={(e) => setOpt("suffixType", e.target.value as "invisible" | "hex")}
                        >
                          <option value="invisible">Invisible (zero-width)</option>
                          <option value="hex">Visible hex tag</option>
                        </select>
                        <Input
                          type="number"
                          min={1}
                          max={8}
                          value={opts.suffixLength}
                          onChange={(e) => setOpt("suffixLength", Number(e.target.value))}
                          className="h-7 w-16 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">chars</span>
                      </div>
                    )}
                  </div>

                  {/* Send window + daily limit */}
                  <div className="grid gap-3 sm:grid-cols-3 pt-1 border-t">
                    <div className="space-y-1">
                      <Label className="text-xs">Send window start (hour, 0–23)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={opts.sendStartHour}
                        onChange={(e) => setOpt("sendStartHour", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Send window end (hour, 0–23)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={opts.sendEndHour}
                        onChange={(e) => setOpt("sendEndHour", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Daily send limit (per instance)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={opts.dailyLimit}
                        onChange={(e) => setOpt("dailyLimit", Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm pt-1 border-t">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.checkNumberExists}
                        onChange={(e) => setOpt("checkNumberExists", e.target.checked)}
                      />
                      Verify numbers are on WhatsApp before sending
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opts.respectOptOut}
                        onChange={(e) => setOpt("respectOptOut", e.target.checked)}
                      />
                      Skip contacts who replied STOP/unsubscribe
                    </label>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>• Each batch of {opts.batchSize} msgs is followed by a ~{fmtMs(opts.batchPauseMs)} pause</p>
                    <p>• Msgs within a batch are spaced {fmtMs(opts.minDelayMs)}–{fmtMs(opts.maxDelayMs)} apart (random)</p>
                    {opts.shuffle && <p>• Send order is randomised to avoid sequential patterns</p>}
                    {opts.appendSuffix && <p>• A unique {opts.suffixType} suffix makes each message distinct</p>}
                    <p>• Sends only between {opts.sendStartHour}:00 and {opts.sendEndHour}:00 (server local time); max {opts.dailyLimit}/day</p>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={
                creating || !instanceId || !listId ||
                (msgType === "text" && !msgText.trim()) ||
                (msgType === "image" && !imgFile)
              }
              className="w-full sm:w-auto"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Start Campaign
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Campaign list */}
      {instanceId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Campaigns</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => refetchCampaigns()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {campaigns.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No campaigns yet for this instance.</p>
            ) : (
              <div className="divide-y">
                {campaigns.map((c: Campaign) => {
                  const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={c.id}
                      className={`cursor-pointer px-4 py-3 hover:bg-accent/50 transition-colors ${
                        selectedCampaignId === c.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedCampaignId(c.id === selectedCampaignId ? null : c.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={cfg.variant} className="gap-1 text-xs shrink-0">
                              <Icon className={`h-3 w-3 ${c.status === "running" ? "animate-spin" : ""}`} />
                              {cfg.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {c.list_type} list · {new Date(c.created_at).toLocaleString()}
                            </span>
                          </div>
                          {c.total_count > 0 && (
                            <div className="mt-1.5 space-y-1">
                              <ProgressBar sent={c.sent_count} failed={c.failed_count} total={c.total_count} />
                              <p className="text-xs text-muted-foreground">
                                {c.sent_count} sent · {c.failed_count} failed · {c.skipped_count} skipped / {c.total_count} total
                              </p>
                            </div>
                          )}
                        </div>
                        {(c.status === "running" || c.status === "pending") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => { e.stopPropagation(); handleCancel(c.id); }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Campaign detail */}
      {selectedCampaignId && detail && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Results — {detail.sent_count} sent, {detail.failed_count} failed
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => refetchDetail()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {detail.results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No results yet.</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {detail.results.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-2">
                    <span className="font-mono text-xs text-muted-foreground truncate flex-1 mr-3">{r.recipient}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.error && <span className="text-xs text-red-500 max-w-[160px] truncate">{r.error}</span>}
                      <Badge
                        variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
