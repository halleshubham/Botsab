import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { register } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "₹199/mo",
    features: ["1 instance"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹499/mo",
    features: ["3 instances"],
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: "₹999/mo",
    features: ["10 instances"],
  },
];

export function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultPlan = (searchParams.get("plan") ?? "pro") as string;

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState(defaultPlan);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await register(email, password, plan, phone || undefined);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("apiKey", data.apiKey);
      localStorage.setItem("role", data.role);
      localStorage.setItem("status", data.status);
      localStorage.setItem("plan", plan);
      localStorage.setItem("email", email);

      if (data.status === "pending") {
        navigate("/pending");
      } else {
        toast({ title: "Welcome to Botsab!", description: "Your account is ready." });
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Registration failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-xl space-y-6">
        {/* Brand */}
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-xl font-bold">
            <Bot className="h-6 w-6 text-primary" />
            Botsab
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">Create your account</p>
        </div>

        {/* Plan picker */}
        <div>
          <p className="text-sm font-medium mb-3 text-center text-muted-foreground">Choose your plan</p>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                className={cn(
                  "relative rounded-xl border-2 p-3 text-left transition-all focus:outline-none",
                  plan === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                )}
              >
                {p.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <Badge className="px-2 py-0.5 text-[10px]">Popular</Badge>
                  </div>
                )}
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-primary font-medium">{p.price}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="h-2.5 w-2.5 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan === p.id && (
                  <div className="absolute top-2 right-2">
                    <div className="h-3 w-3 rounded-full bg-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Registration form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Account details</CardTitle>
            <CardDescription>Your account will be reviewed before activation.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Mobile number
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(for quick support)</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account…" : `Register with ${PLANS.find((p) => p.id === plan)?.name ?? "Starter"}`}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
