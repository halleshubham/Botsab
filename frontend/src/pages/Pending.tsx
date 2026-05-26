import { Clock, LogOut, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — 1 instance · ₹199/mo",
  pro: "Pro — 3 instances · ₹499/mo",
  business: "Business — 10 instances · ₹999/mo",
};

const STEPS = [
  "Our team reviews your subscription request",
  "Your instance limit is set based on your plan",
  "You receive an email and can sign in immediately",
];

export function Pending() {
  const plan = localStorage.getItem("plan") ?? "starter";
  const email = localStorage.getItem("email") ?? "";

  function handleLogout() {
    localStorage.removeItem("apiKey");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    localStorage.removeItem("status");
    localStorage.removeItem("plan");
    localStorage.removeItem("email");
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
          <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
          <CardDescription className="text-base">
            {email ? `We've received your request for ${email}.` : "We've received your registration."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {plan && PLAN_LABELS[plan] && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Selected plan</span>
              <Badge variant="secondary">{PLAN_LABELS[plan]}</Badge>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium">What happens next?</p>
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>{step}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Approval typically takes 1–24 hours. Come back and sign in once you're approved.
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
