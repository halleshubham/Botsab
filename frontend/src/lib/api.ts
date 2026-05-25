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
  announce: boolean;
};
export const listGroups = (instanceId: string) =>
  api.get<Group[]>(`/instances/${instanceId}/groups`);

// Contact Lists
export type ContactListMember = {
  id: string;
  phone_number: string;
  label: string | null;
  created_at: string;
};
export type ContactList = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  created_at: string;
};
export type ContactListDetail = ContactList & { members: ContactListMember[] };

export const listContactLists = () => api.get<ContactList[]>("/contact-lists");
export const createContactList = (name: string, description?: string) =>
  api.post<ContactList>("/contact-lists", { name, description });
export const getContactList = (listId: string) =>
  api.get<ContactListDetail>(`/contact-lists/${listId}`);
export const updateContactList = (listId: string, data: { name?: string; description?: string | null }) =>
  api.put<ContactList>(`/contact-lists/${listId}`, data);
export const deleteContactList = (listId: string) => api.delete(`/contact-lists/${listId}`);
export const addContactListMembers = (
  listId: string,
  members: { phone_number: string; label?: string }[]
) => api.post<{ added: number; skipped: number }>(`/contact-lists/${listId}/members`, { members });
export const deleteContactListMember = (listId: string, memberId: string) =>
  api.delete(`/contact-lists/${listId}/members/${memberId}`);

// Group Lists
export type GroupListMember = {
  id: string;
  group_jid: string;
  label: string | null;
  created_at: string;
};
export type GroupList = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  created_at: string;
};
export type GroupListDetail = GroupList & { members: GroupListMember[] };

export const listGroupLists = () => api.get<GroupList[]>("/group-lists");
export const createGroupList = (name: string, description?: string) =>
  api.post<GroupList>("/group-lists", { name, description });
export const getGroupList = (listId: string) => api.get<GroupListDetail>(`/group-lists/${listId}`);
export const updateGroupList = (listId: string, data: { name?: string; description?: string | null }) =>
  api.put<GroupList>(`/group-lists/${listId}`, data);
export const deleteGroupList = (listId: string) => api.delete(`/group-lists/${listId}`);
export const addGroupListMembers = (
  listId: string,
  members: { group_jid: string; label?: string }[]
) => api.post<{ added: number; skipped: number }>(`/group-lists/${listId}/members`, { members });
export const deleteGroupListMember = (listId: string, memberId: string) =>
  api.delete(`/group-lists/${listId}/members/${memberId}`);

// Bulk Campaigns
export type BulkCampaignOptions = {
  minDelayMs: number;
  maxDelayMs: number;
  batchSize: number;
  batchPauseMs: number;
  shuffle: boolean;
  appendSuffix: boolean;
  suffixType: "invisible" | "hex";
  suffixLength: number;
  sendTypingIndicator: boolean;
  markReadBeforeSend: boolean;
  maxRecipients: number;
};
export type CampaignResult = {
  recipient: string;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  sent_at: string | null;
};
export type Campaign = {
  id: string;
  list_type: "contact" | "group";
  list_id: string;
  message_payload: Record<string, unknown>;
  options: BulkCampaignOptions;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};
export type CampaignDetail = Campaign & { results: CampaignResult[] };

export const listCampaigns = (instanceId: string) =>
  api.get<Campaign[]>(`/instances/${instanceId}/campaigns`);
export const getCampaign = (instanceId: string, campaignId: string) =>
  api.get<CampaignDetail>(`/instances/${instanceId}/campaigns/${campaignId}`);
export const createCampaign = (
  instanceId: string,
  data: {
    list_type: "contact" | "group";
    list_id: string;
    message: Record<string, unknown>;
    options?: Partial<BulkCampaignOptions>;
  }
) => api.post<{ id: string; status: string }>(`/instances/${instanceId}/campaigns`, data);
export const cancelCampaign = (instanceId: string, campaignId: string) =>
  api.post(`/instances/${instanceId}/campaigns/${campaignId}/cancel`);
