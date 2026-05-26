import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MessageSquare, Zap, Shield, Globe, Users, Webhook,
  CheckCircle2, ArrowRight, Bot, Github, AlertTriangle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const GITHUB_URL = "https://github.com/halleshubham/Botsab";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Bulk Campaigns",
    description: "Send personalised messages to thousands of contacts or groups with smart pacing and message variants.",
  },
  {
    icon: Shield,
    title: "Anti-Ban Protection",
    description: "Human-like timing, opt-out detection, number validation, and daily limits keep your accounts safer.",
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

type Currency = "INR" | "USD";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceINR: "₹499",
    priceUSD: "$6",
    period: "/month",
    description: "For individuals and small teams",
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
    priceINR: "₹1,299",
    priceUSD: "$15",
    period: "/month",
    description: "For growing businesses",
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
    priceINR: "₹3,999",
    priceUSD: "$48",
    period: "/month",
    description: "Unlimited scale for agencies",
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
  const [currency, setCurrency] = useState<Currency>("INR");
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("apiKey")) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Unofficial API disclaimer banner */}
      {!disclaimerDismissed && (
        <div className="bg-yellow-50 dark:bg-yellow-950/40 border-b border-yellow-200 dark:border-yellow-800">
          <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            <p className="text-xs text-yellow-800 dark:text-yellow-300 flex-1">
              <strong>Disclaimer:</strong> Botsab is an independent open-source project and is{" "}
              <strong>not</strong> affiliated with, endorsed by, or connected to WhatsApp LLC or Meta
              Platforms, Inc. This is <strong>not</strong> the official WhatsApp Business API.
              Using unofficial WhatsApp automation may violate WhatsApp's Terms of Service.{" "}
              <Link to="/terms" className="underline hover:no-underline">Read our Terms</Link>.
            </p>
            <button
              onClick={() => setDisclaimerDismissed(true)}
              className="text-yellow-600 hover:text-yellow-800 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Github className="h-4 w-4" />
              Open Source
            </a>
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
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
        <div className="flex items-center justify-center gap-3 mb-5">
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            WhatsApp Automation API
          </Badge>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Proudly Open Source
          </a>
        </div>
        <h1 className="text-5xl font-bold leading-tight mb-6 tracking-tight">
          Scale Your WhatsApp<br />
          <span className="text-primary">Outreach Effortlessly</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Send bulk messages, manage groups, and automate with webhooks — all through a clean REST API.
          Built with anti-ban protection so your accounts stay safer at scale.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Button size="lg" asChild>
            <Link to="/register">
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="mr-2 h-4 w-4" /> View on GitHub
            </a>
          </Button>
        </div>

        <div className="mt-14 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
          {[
            "No credit card required",
            "Admin-approved access",
            "REST API + Webhooks",
            "Anti-ban built-in",
          ].map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* Unofficial API warning (full-width card) */}
      <section className="bg-amber-50 dark:bg-amber-950/20 border-y border-amber-200 dark:border-amber-800 py-5">
        <div className="mx-auto max-w-6xl px-4 flex items-start gap-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-semibold">Unofficial API — Not affiliated with WhatsApp or Meta</p>
            <p className="leading-relaxed">
              Botsab uses an unofficial, third-party WhatsApp client library. It is{" "}
              <strong>not</strong> the WhatsApp Business Platform (Cloud API) provided by Meta Platforms, Inc.
              WhatsApp® is a registered trademark of WhatsApp LLC. Use at your own risk — accounts may be
              banned for violating WhatsApp's Terms of Service. Please review our{" "}
              <Link to="/terms" className="underline hover:no-underline font-medium">Terms of Use</Link>{" "}
              before signing up.
            </p>
          </div>
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
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg">
              Built for Indian businesses. All accounts activated after admin review.
            </p>
            {/* Currency toggle */}
            <div className="mt-5 inline-flex items-center rounded-full border bg-muted/50 p-1 gap-1">
              {(["INR", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    currency === c
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "INR" ? "₹ INR" : "$ USD"}
                </button>
              ))}
            </div>
            {currency === "INR" && (
              <p className="text-xs text-muted-foreground mt-2">Prices in Indian Rupees. GST extra.</p>
            )}
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
                  <div className="flex items-end gap-1.5">
                    <span className="text-4xl font-bold">
                      {currency === "INR" ? plan.priceINR : plan.priceUSD}
                    </span>
                    <span className="text-muted-foreground mb-1.5">{plan.period}</span>
                  </div>
                  {currency === "INR" && (
                    <p className="text-xs text-muted-foreground mt-1">≈ {plan.priceUSD}/mo USD</p>
                  )}
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
            All accounts require superadmin approval before access is granted.
            Most requests are reviewed within 24 hours.
          </p>
        </div>
      </section>

      {/* Open Source CTA */}
      <section className="bg-muted/40 border-y py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <Github className="h-10 w-10 mx-auto mb-4 text-foreground" />
          <h2 className="text-2xl font-bold mb-2">Proudly Open Source</h2>
          <p className="text-muted-foreground mb-6">
            Botsab is fully open source. Audit the code, self-host it, or contribute on GitHub.
            No black boxes, no hidden logic.
          </p>
          <Button variant="outline" size="lg" asChild>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="mr-2 h-4 w-4" />
              View source on GitHub
            </a>
          </Button>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16">
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
      <footer className="border-t bg-muted/20 py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <Bot className="h-5 w-5 text-primary" />
                Botsab
              </div>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Open-source WhatsApp automation API. Not affiliated with WhatsApp LLC or Meta Platforms, Inc.
              </p>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-3.5 w-3.5" />
                github.com/halleshubham/Botsab
              </a>
            </div>
            <div className="flex gap-12 text-sm">
              <div className="space-y-2">
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Product</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <div><a href="#features" className="hover:text-foreground transition-colors">Features</a></div>
                  <div><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></div>
                  <div>
                    <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                      GitHub
                    </a>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Legal</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <div><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></div>
                  <div><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Use</Link></div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Account</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <div><Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link></div>
                  <div><Link to="/register" className="hover:text-foreground transition-colors">Register</Link></div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Botsab. All rights reserved.</span>
            <span>
              WhatsApp® is a registered trademark of WhatsApp LLC. Botsab is not affiliated with or endorsed by WhatsApp or Meta.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
