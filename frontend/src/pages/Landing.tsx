import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MessageSquare, Zap, Shield, Globe, Users, Webhook,
  CheckCircle2, ArrowRight, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Bulk Campaigns",
    description: "Send personalized messages to thousands of contacts or groups with smart pacing and message variants.",
  },
  {
    icon: Shield,
    title: "Anti-Ban Protection",
    description: "Human-like timing, opt-out detection, number validation, and daily limits keep your accounts safe.",
  },
  {
    icon: Zap,
    title: "Real-time Webhooks",
    description: "Receive instant event notifications — messages, receipts, connection changes — in your own system.",
  },
  {
    icon: Users,
    title: "Group Management",
    description: "Organise WhatsApp groups into lists and run targeted campaigns across hundreds of groups at once.",
  },
  {
    icon: Globe,
    title: "REST API",
    description: "Full-featured HTTP API with API key auth. Integrate Botsab with any backend, language, or platform.",
  },
  {
    icon: Webhook,
    title: "Multi-Instance",
    description: "Connect multiple WhatsApp numbers and manage them all from a single unified dashboard.",
  },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    period: "/month",
    description: "Perfect for small teams getting started",
    features: [
      "3 WhatsApp instances",
      "500 messages / day",
      "Bulk campaigns",
      "Webhook events",
      "REST API access",
      "Email support",
    ],
    popular: false,
    cta: "Get started",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For growing businesses with higher volume",
    features: [
      "10 WhatsApp instances",
      "2,000 messages / day",
      "Everything in Starter",
      "Advanced anti-ban",
      "Message variants",
      "Priority support",
    ],
    popular: true,
    cta: "Get started",
  },
  {
    id: "business",
    name: "Business",
    price: "$149",
    period: "/month",
    description: "Unlimited scale for enterprises",
    features: [
      "Unlimited instances",
      "Unlimited messages",
      "Everything in Pro",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantee",
    ],
    popular: false,
    cta: "Get started",
  },
];

export function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem("apiKey")) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">Botsab</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 text-center">
        <Badge variant="secondary" className="mb-5 px-3 py-1 text-sm">
          WhatsApp Automation API
        </Badge>
        <h1 className="text-5xl font-bold leading-tight mb-6 tracking-tight">
          Scale Your WhatsApp<br />
          <span className="text-primary">Outreach Effortlessly</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Send bulk messages, manage groups, and automate with webhooks — all through a clean REST API.
          Built with anti-ban protection so your accounts stay safe at scale.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Button size="lg" asChild>
            <Link to="/register">
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login">Sign in to dashboard</Link>
          </Button>
        </div>

        {/* Social proof strip */}
        <div className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
          {["No credit card required", "Admin-approved access", "REST API + Webhooks", "Anti-ban built-in"].map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Everything you need</h2>
            <p className="text-muted-foreground text-lg">Powerful automation tools built for production use</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg">
              Pick a plan and register — accounts are activated after admin review.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-3 items-start">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-8 ${
                  plan.popular
                    ? "border-primary shadow-xl shadow-primary/10 bg-card"
                    : "bg-card shadow-sm"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="px-4 py-1 text-xs font-semibold">Most Popular</Badge>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-5">{plan.description}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground mb-1.5">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  asChild
                >
                  <Link to={`/register?plan=${plan.id}`}>{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-10">
            All accounts require superadmin approval before access is granted. Most requests are reviewed within 24 hours.
          </p>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-primary/5 border-y py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to automate your WhatsApp?</h2>
          <p className="text-muted-foreground mb-6">
            Register today and get access after a quick admin review.
          </p>
          <Button size="lg" asChild>
            <Link to="/register">
              Create your account <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Bot className="h-4 w-4 text-primary" />
            Botsab
          </div>
          <span>© {new Date().getFullYear()} Botsab. All rights reserved.</span>
          <div className="flex gap-5">
            <Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link to="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
