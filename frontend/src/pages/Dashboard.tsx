import { useQuery } from "@tanstack/react-query";
import { Smartphone, Wifi, WifiOff, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listInstances } from "@/lib/api";

export function Dashboard() {
  const { data: instances = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInstances().then((r) => r.data),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const counts = {
    total: instances.length,
    connected: instances.filter((i) => i.status === "connected").length,
    pending: instances.filter((i) => i.status === "qr_pending").length,
    disconnected: instances.filter((i) => i.status === "disconnected").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your WhatsApp instances</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Instances" value={counts.total} icon={<Smartphone className="h-5 w-5 text-muted-foreground" />} />
        <StatCard title="Connected" value={counts.connected} icon={<Wifi className="h-5 w-5 text-green-600" />} valueClass="text-green-600" />
        <StatCard title="QR Pending" value={counts.pending} icon={<QrCode className="h-5 w-5 text-yellow-600" />} valueClass="text-yellow-600" />
        <StatCard title="Disconnected" value={counts.disconnected} icon={<WifiOff className="h-5 w-5 text-muted-foreground" />} />
      </div>

      {instances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent instances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {instances.slice(0, 5).map((inst) => (
                <div key={inst.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{inst.slug}</p>
                    <p className="text-sm text-muted-foreground">{inst.phoneNumber ?? "Not connected"}</p>
                  </div>
                  <StatusDot status={inst.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, valueClass = "" }: { title: string; value: number; icon: React.ReactNode; valueClass?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500",
    qr_pending: "bg-yellow-500",
    disconnected: "bg-gray-300",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] ?? "bg-gray-300"}`} />;
}
