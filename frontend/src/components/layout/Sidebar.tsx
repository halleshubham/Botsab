import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Smartphone, Key, Webhook, LogOut, BookOpen, Users, ShieldCheck, Phone, List, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const BASE_LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instances", label: "Instances", icon: Smartphone },
  { to: "/groups", label: "Groups", icon: Users },
  { to: "/contact-lists", label: "Contact Lists", icon: Phone },
  { to: "/group-lists", label: "Group Lists", icon: List },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/keys", label: "API Keys", icon: Key },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/docs", label: "API Docs", icon: BookOpen },
];

const ADMIN_LINK = { to: "/admin", label: "Admin", icon: ShieldCheck };

export function Sidebar() {
  const navigate = useNavigate();
  const [role, setRole] = useState(localStorage.getItem("role") ?? "user");

  // Re-read role after AppLayout hydrates it from the API
  useEffect(() => {
    const interval = setInterval(() => {
      const stored = localStorage.getItem("role") ?? "user";
      if (stored !== role) setRole(stored);
    }, 500);
    return () => clearInterval(interval);
  }, [role]);

  const isSuperadmin = role === "superadmin";
  const links = isSuperadmin ? [...BASE_LINKS, ADMIN_LINK] : BASE_LINKS;

  function handleLogout() {
    localStorage.removeItem("apiKey");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    navigate("/login");
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-6">
        <span className="text-lg font-bold text-primary">Botsab</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </aside>
  );
}
