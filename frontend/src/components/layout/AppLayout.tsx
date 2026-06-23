import { useState, useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { getMe } from "@/lib/api";

export function AppLayout() {
  const apiKey = localStorage.getItem("apiKey");
  const [status, setStatus] = useState(localStorage.getItem("status") ?? "active");

  useEffect(() => {
    if (!apiKey) return;
    getMe()
      .then(({ data }) => {
        localStorage.setItem("role", data.role);
        localStorage.setItem("status", data.status);
        localStorage.setItem("plan", data.plan);
        setStatus(data.status);
      })
      .catch(() => {});
  }, [apiKey]);

  if (!apiKey) return <Navigate to="/login" replace />;
  if (status === "pending") return <Navigate to="/pending" replace />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <Outlet />
      </main>
    </div>
  );
}
