import { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { getMe } from "@/lib/api";

export function AppLayout() {
  const apiKey = localStorage.getItem("apiKey");

  useEffect(() => {
    if (!apiKey) return;
    // Hydrate role on every app load so it stays fresh
    getMe()
      .then(({ data }) => localStorage.setItem("role", data.role))
      .catch(() => {});
  }, [apiKey]);

  if (!apiKey) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <Outlet />
      </main>
    </div>
  );
}
