import axios from "axios";

export const api = axios.create({ baseURL: "/" });

api.interceptors.request.use((config) => {
  const key = localStorage.getItem("apiKey");
  if (key) config.headers["x-api-key"] = key;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("apiKey");
      localStorage.removeItem("userId");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const register = (email: string, password: string) =>
  api.post<{ userId: string; apiKey: string; role: string }>("/auth/register", { email, password });

export const login = (email: string, password: string) =>
  api.post<{ userId: string; role: string }>("/auth/login", { email, password });

export const getMe = () =>
  api.get<{ userId: string; email: string; role: string; instanceLimit: number }>("/auth/me");

// Keys
export type ApiKey = { id: string; label: string; lastUsedAt: string | null; createdAt: string };
export const listKeys = () => api.get<ApiKey[]>("/keys");
export const createKey = (label: string) => api.post<{ id: string; key: string; label: string }>("/keys", { label });
export const revokeKey = (keyId: string) => api.delete(`/keys/${keyId}`);

// Instances
export type Instance = {
  id: string;
  slug: string;
  phoneNumber: string | null;
  status: "disconnected" | "qr_pending" | "connected";
  createdAt: string;
};
export const listInstances = () => api.get<Instance[]>("/instances");
export const createInstance = (slug: string) => api.post<Instance>("/instances", { slug });
export const deleteInstance = (id: string) => api.delete(`/instances/${id}`);

// Connection
export const connectInstance = (id: string) =>
  api.post<{ status: string }>(`/instances/${id}/connect`);
export const disconnectInstance = (id: string) =>
  api.post<{ status: string }>(`/instances/${id}/disconnect`);
export const logoutInstance = (id: string) =>
  api.post<{ status: string }>(`/instances/${id}/logout`);
export const getQr = (id: string) =>
  api.get<{ qr: string; qrString: string; expiresIn: number }>(`/instances/${id}/qr`);

// Webhook
export type WebhookConfig = { url: string | null; events: string[]; hasSecret: boolean };
export const getWebhook = (id: string) => api.get<WebhookConfig>(`/instances/${id}/webhook`);
export const updateWebhook = (id: string, data: { url?: string | null; events?: string[]; secret?: string }) =>
  api.put<WebhookConfig>(`/instances/${id}/webhook`, data);

// Messages
export const sendMessage = (id: string, to: string, text: string) =>
  api.post(`/instances/${id}/messages/send`, { to, type: "text", text });

// Admin
export type AdminUser = {
  id: string;
  email: string;
  role: string;
  instanceLimit: number;
  instanceCount: number;
  createdAt: string;
};
export const listAdminUsers = () => api.get<AdminUser[]>("/admin/users");
export const updateAdminUser = (userId: string, data: { instanceLimit?: number; role?: string }) =>
  api.patch<{ id: string; email: string; role: string; instanceLimit: number }>(`/admin/users/${userId}`, data);

// Groups
export type Group = {
  id: string;
  name: string;
  description: string | null;
  participantCount: number;
  createdAt: string | null;
};
export const listGroups = (instanceId: string) =>
  api.get<Group[]>(`/instances/${instanceId}/groups`);
