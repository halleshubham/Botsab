import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Pending } from "@/pages/Pending";
import { Privacy } from "@/pages/Privacy";
import { Terms } from "@/pages/Terms";
import { Dashboard } from "@/pages/Dashboard";
import { Instances } from "@/pages/Instances";
import { ApiKeys } from "@/pages/ApiKeys";
import { Webhooks } from "@/pages/Webhooks";
import { ApiDocs } from "@/pages/ApiDocs";
import { Groups } from "@/pages/Groups";
import { Admin } from "@/pages/Admin";
import { ContactLists } from "@/pages/ContactLists";
import { GroupLists } from "@/pages/GroupLists";
import { Campaigns } from "@/pages/Campaigns";
import { Toaster } from "@/components/ui/toaster";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          {/* App (auth required) */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/keys" element={<ApiKeys />} />
            <Route path="/webhooks" element={<Webhooks />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/contact-lists" element={<ContactLists />} />
            <Route path="/group-lists" element={<GroupLists />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/docs" element={<ApiDocs />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
