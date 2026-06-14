// Typed REST client for the ReFx panel-api (REST under /api/v1).
// Handles auth headers from the token store, transparent refresh on 401,
// and error normalization into a single ApiError shape.

import { getTokens, setTokens, clearTokens } from "@/lib/auth";
import type {
  AuthTokens,
  Backup,
  GameCategory,
  GameTemplate,
  Invoice,
  KbArticle,
  LoginResponse,
  Node,
  NodeHeartbeat,
  Notification,
  Paginated,
  PaymentMethod,
  Product,
  Schedule,
  Server,
  ServerDatabase,
  ServerStat,
  Session,
  ApiKey,
  Subscription,
  SubUser,
  Ticket,
  TicketMessage,
  User,
  FileEntry,
  AuditLog,
  GlobalAlert,
} from "@/lib/types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const API_BASE = `${API_URL}/api/v1`;

/** Normalized error thrown by all client calls. */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip attaching the Authorization header (auth endpoints). */
  anonymous?: boolean;
  /** Internal: prevents infinite refresh loops. */
  _retry?: boolean;
  /** Raw query params appended to the URL. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function doRefresh(): Promise<AuthTokens | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = (await res.json()) as AuthTokens;
    setTokens(data);
    return data;
  } catch {
    clearTokens();
    return null;
  }
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, anonymous, _retry, query, headers, ...rest } = opts;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string>),
  };

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      payload = body; // let the browser set the multipart boundary
    } else {
      finalHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  if (!anonymous) {
    const tokens = getTokens();
    if (tokens?.accessToken) {
      finalHeaders["Authorization"] = `Bearer ${tokens.accessToken}`;
    }
  }

  const res = await fetch(buildUrl(path, query), {
    ...rest,
    headers: finalHeaders,
    body: payload,
  });

  // Transparent refresh-and-retry on a single 401.
  if (res.status === 401 && !anonymous && !_retry) {
    refreshPromise = refreshPromise ?? doRefresh();
    const refreshed = await refreshPromise;
    refreshPromise = null;
    if (refreshed) {
      return request<T>(path, { ...opts, _retry: true });
    }
    clearTokens();
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && (data?.message || data?.error)) ||
      (typeof data === "string" && data) ||
      res.statusText ||
      "Request failed";
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join(", ") : message,
      isJson ? data?.code : undefined,
      isJson ? data?.details ?? data?.errors : undefined,
    );
  }

  return data as T;
}

/** Low-level verbs, exported for ad-hoc calls. */
export const http = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Domain-grouped API surface. Each group maps 1:1 to REST resources.
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    login: (email: string, password: string) =>
      http.post<LoginResponse>("/auth/login", { email, password }, { anonymous: true }),
    register: (input: { email: string; password: string; firstName?: string; lastName?: string }) =>
      http.post<LoginResponse>("/auth/register", input, { anonymous: true }),
    verifyMfa: (mfaToken: string, code: string, method: "totp" | "recovery" = "totp") =>
      http.post<LoginResponse>("/auth/mfa/verify", { mfaToken, code, method }, { anonymous: true }),
    // WebAuthn assertion exchange. TODO(impl): full ceremony with @simplewebauthn/browser.
    verifyWebAuthn: (mfaToken: string, assertion: unknown) =>
      http.post<LoginResponse>("/auth/mfa/webauthn", { mfaToken, assertion }, { anonymous: true }),
    logout: () => http.post<void>("/auth/logout"),
    me: () => http.get<User>("/auth/me"),
    forgotPassword: (email: string) =>
      http.post<void>("/auth/forgot-password", { email }, { anonymous: true }),
  },

  account: {
    update: (input: Partial<Pick<User, "firstName" | "lastName" | "locale" | "timezone" | "avatarUrl">>) =>
      http.patch<User>("/account", input),
    changePassword: (currentPassword: string, newPassword: string) =>
      http.post<void>("/account/password", { currentPassword, newPassword }),
    sessions: () => http.get<Session[]>("/account/sessions"),
    revokeSession: (id: string) => http.delete<void>(`/account/sessions/${id}`),
    apiKeys: () => http.get<ApiKey[]>("/account/api-keys"),
    createApiKey: (input: { name: string; scopes: ApiKey["scopes"] }) =>
      http.post<ApiKey>("/account/api-keys", input),
    revokeApiKey: (id: string) => http.delete<void>(`/account/api-keys/${id}`),
    // MFA management. TODO(impl): WebAuthn registration ceremony.
    totpSetup: () => http.post<{ secret: string; otpauthUrl: string }>("/account/mfa/totp/setup"),
    totpEnable: (code: string) =>
      http.post<{ recoveryCodes: string[] }>("/account/mfa/totp/enable", { code }),
    totpDisable: (code: string) => http.post<void>("/account/mfa/totp/disable", { code }),
    notifications: () => http.get<Notification[]>("/account/notifications"),
    markNotificationRead: (id: string) =>
      http.post<void>(`/account/notifications/${id}/read`),
  },

  servers: {
    list: (query?: { search?: string; state?: string }) =>
      http.get<Server[]>("/servers", { query }),
    get: (id: string) => http.get<Server>(`/servers/${id}`),
    stats: (id: string) => http.get<ServerStat>(`/servers/${id}/stats`),
    statsHistory: (id: string, range = "1h") =>
      http.get<ServerStat[]>(`/servers/${id}/stats/history`, { query: { range } }),
    power: (id: string, signal: "start" | "stop" | "restart" | "kill") =>
      http.post<void>(`/servers/${id}/power`, { signal }),
    command: (id: string, command: string) =>
      http.post<void>(`/servers/${id}/command`, { command }),
    rename: (id: string, name: string, description?: string) =>
      http.patch<Server>(`/servers/${id}`, { name, description }),
    updateStartup: (id: string, input: { startupCommand?: string; dockerImage?: string }) =>
      http.patch<Server>(`/servers/${id}/startup`, input),
    variables: (id: string) =>
      http.get<{ envName: string; value: string }[]>(`/servers/${id}/variables`),
    setVariable: (id: string, envName: string, value: string) =>
      http.put<void>(`/servers/${id}/variables/${envName}`, { value }),
    reinstall: (id: string) => http.post<void>(`/servers/${id}/reinstall`),
    sftp: (id: string) =>
      http.get<{ host: string; port: number; username: string }>(`/servers/${id}/sftp`),
    rotateSftp: (id: string) =>
      http.post<{ password: string }>(`/servers/${id}/sftp/rotate`),

    // Game switching — the signature flow.
    switchableTemplates: (id: string) =>
      http.get<GameTemplate[]>(`/servers/${id}/switch-game/templates`),
    switchGame: (id: string, input: { templateId: string; preserveData: boolean }) =>
      http.post<void>(`/servers/${id}/switch-game`, input),

    // Resource upgrade/downgrade.
    upgradePreview: (id: string, input: { cpuCores: number; memoryMb: number; diskMb: number }) =>
      http.post<{ amountMinor: number; currency: string; interval: string; deltaMinor: number }>(
        `/servers/${id}/upgrade/preview`,
        input,
      ),
    upgrade: (id: string, input: { cpuCores: number; memoryMb: number; diskMb: number }) =>
      http.post<void>(`/servers/${id}/upgrade`, input),

    // Sub-users
    subUsers: (id: string) => http.get<SubUser[]>(`/servers/${id}/sub-users`),
    addSubUser: (id: string, input: { email: string; permissions: string[] }) =>
      http.post<SubUser>(`/servers/${id}/sub-users`, input),
    updateSubUser: (id: string, subId: string, permissions: string[]) =>
      http.patch<SubUser>(`/servers/${id}/sub-users/${subId}`, { permissions }),
    removeSubUser: (id: string, subId: string) =>
      http.delete<void>(`/servers/${id}/sub-users/${subId}`),

    // Files
    files: {
      list: (id: string, path = "/") =>
        http.get<FileEntry[]>(`/servers/${id}/files/list`, { query: { path } }),
      read: (id: string, path: string) =>
        http.get<string>(`/servers/${id}/files/contents`, { query: { path } }),
      write: (id: string, path: string, content: string) =>
        http.post<void>(`/servers/${id}/files/write`, { path, content }),
      mkdir: (id: string, path: string) =>
        http.post<void>(`/servers/${id}/files/mkdir`, { path }),
      rename: (id: string, from: string, to: string) =>
        http.put<void>(`/servers/${id}/files/rename`, { from, to }),
      delete: (id: string, paths: string[]) =>
        http.post<void>(`/servers/${id}/files/delete`, { paths }),
      compress: (id: string, paths: string[]) =>
        http.post<{ path: string }>(`/servers/${id}/files/compress`, { paths }),
      decompress: (id: string, path: string) =>
        http.post<void>(`/servers/${id}/files/decompress`, { path }),
      chmod: (id: string, path: string, mode: string) =>
        http.post<void>(`/servers/${id}/files/chmod`, { path, mode }),
      // Returns a signed URL for direct upload to the node. TODO(impl): tus/multipart.
      uploadUrl: (id: string, path: string) =>
        http.post<{ url: string }>(`/servers/${id}/files/upload-url`, { path }),
      downloadUrl: (id: string, path: string) =>
        http.get<{ url: string }>(`/servers/${id}/files/download-url`, { query: { path } }),
    },

    // Backups
    backups: {
      list: (id: string) => http.get<Backup[]>(`/servers/${id}/backups`),
      create: (id: string, input: { name: string; ignoredFiles?: string[] }) =>
        http.post<Backup>(`/servers/${id}/backups`, input),
      restore: (id: string, backupId: string) =>
        http.post<void>(`/servers/${id}/backups/${backupId}/restore`),
      lock: (id: string, backupId: string, locked: boolean) =>
        http.patch<Backup>(`/servers/${id}/backups/${backupId}`, { isLocked: locked }),
      delete: (id: string, backupId: string) =>
        http.delete<void>(`/servers/${id}/backups/${backupId}`),
      downloadUrl: (id: string, backupId: string) =>
        http.get<{ url: string }>(`/servers/${id}/backups/${backupId}/download`),
    },

    // Databases
    databases: {
      list: (id: string) => http.get<ServerDatabase[]>(`/servers/${id}/databases`),
      create: (id: string, input: { engine: ServerDatabase["engine"]; name: string; remoteAccess?: string }) =>
        http.post<ServerDatabase>(`/servers/${id}/databases`, input),
      rotatePassword: (id: string, dbId: string) =>
        http.post<{ password: string }>(`/servers/${id}/databases/${dbId}/rotate`),
      delete: (id: string, dbId: string) =>
        http.delete<void>(`/servers/${id}/databases/${dbId}`),
    },

    // Schedules
    schedules: {
      list: (id: string) => http.get<Schedule[]>(`/servers/${id}/schedules`),
      create: (id: string, input: Partial<Schedule>) =>
        http.post<Schedule>(`/servers/${id}/schedules`, input),
      update: (id: string, scheduleId: string, input: Partial<Schedule>) =>
        http.patch<Schedule>(`/servers/${id}/schedules/${scheduleId}`, input),
      delete: (id: string, scheduleId: string) =>
        http.delete<void>(`/servers/${id}/schedules/${scheduleId}`),
      run: (id: string, scheduleId: string) =>
        http.post<void>(`/servers/${id}/schedules/${scheduleId}/run`),
    },
  },

  catalog: {
    products: (query?: { type?: string }) => http.get<Product[]>("/catalog/products", { query }),
    product: (slug: string) => http.get<Product>(`/catalog/products/${slug}`),
    categories: () => http.get<GameCategory[]>("/catalog/categories"),
    templates: (query?: { categoryId?: string; search?: string }) =>
      http.get<GameTemplate[]>("/catalog/templates", { query }),
  },

  orders: {
    // Creates a checkout session / provisions a server. TODO(impl): Stripe redirect.
    create: (input: {
      productId: string;
      priceId: string;
      templateId: string;
      regionId?: string;
      name: string;
    }) => http.post<{ checkoutUrl?: string; serverId?: string; invoiceId?: string }>("/orders", input),
  },

  billing: {
    invoices: () => http.get<Invoice[]>("/billing/invoices"),
    invoice: (id: string) => http.get<Invoice>(`/billing/invoices/${id}`),
    payInvoice: (id: string) =>
      http.post<{ checkoutUrl?: string }>(`/billing/invoices/${id}/pay`),
    subscriptions: () => http.get<Subscription[]>("/billing/subscriptions"),
    cancelSubscription: (id: string, atPeriodEnd = true) =>
      http.post<Subscription>(`/billing/subscriptions/${id}/cancel`, { atPeriodEnd }),
    resumeSubscription: (id: string) =>
      http.post<Subscription>(`/billing/subscriptions/${id}/resume`),
    paymentMethods: () => http.get<PaymentMethod[]>("/billing/payment-methods"),
    addPaymentMethodUrl: () =>
      http.post<{ url: string }>("/billing/payment-methods/setup"),
    setDefaultPaymentMethod: (id: string) =>
      http.post<void>(`/billing/payment-methods/${id}/default`),
    removePaymentMethod: (id: string) =>
      http.delete<void>(`/billing/payment-methods/${id}`),
  },

  support: {
    tickets: (query?: { state?: string }) => http.get<Ticket[]>("/support/tickets", { query }),
    ticket: (id: string) =>
      http.get<Ticket & { messages: TicketMessage[] }>(`/support/tickets/${id}`),
    createTicket: (input: { subject: string; body: string; priority?: string; categoryId?: string }) =>
      http.post<Ticket>("/support/tickets", input),
    reply: (id: string, body: string) =>
      http.post<TicketMessage>(`/support/tickets/${id}/messages`, { body }),
    setState: (id: string, state: Ticket["state"]) =>
      http.patch<Ticket>(`/support/tickets/${id}`, { state }),
    kb: (query?: { search?: string; category?: string }) =>
      http.get<KbArticle[]>("/support/kb", { query }),
    kbArticle: (slug: string) => http.get<KbArticle>(`/support/kb/${slug}`),
  },

  dashboard: {
    summary: () =>
      http.get<{
        servers: Server[];
        usage: { cpuPct: number; memUsedMb: number; memTotalMb: number; diskUsedMb: number; diskTotalMb: number };
        billing: { nextInvoiceMinor: number; currency: string; nextDueAt: string | null; openInvoices: number };
        activity: AuditLog[];
        alerts: GlobalAlert[];
      }>("/dashboard"),
  },

  // -------------------------------------------------------------------------
  // Admin surface (role-gated server-side; the UI also gates by role).
  // -------------------------------------------------------------------------
  admin: {
    nodes: () => http.get<Node[]>("/admin/nodes"),
    node: (id: string) => http.get<Node>(`/admin/nodes/${id}`),
    nodeHeartbeats: (id: string, range = "1h") =>
      http.get<NodeHeartbeat[]>(`/admin/nodes/${id}/heartbeats`, { query: { range } }),
    createNode: (input: Partial<Node> & { regionId: string }) =>
      http.post<Node & { bootstrapToken: string }>("/admin/nodes", input),
    setNodeMaintenance: (id: string, maintenance: boolean) =>
      http.patch<Node>(`/admin/nodes/${id}`, { maintenance }),

    users: (query?: { search?: string; state?: string }) =>
      http.get<Paginated<User>>("/admin/users", { query }),
    setUserState: (id: string, state: User["state"]) =>
      http.patch<User>(`/admin/users/${id}`, { state }),

    products: () => http.get<Product[]>("/admin/products"),
    saveProduct: (input: Partial<Product>) =>
      input.id
        ? http.patch<Product>(`/admin/products/${input.id}`, input)
        : http.post<Product>("/admin/products", input),

    templates: () => http.get<GameTemplate[]>("/admin/templates"),
    saveTemplate: (input: Partial<GameTemplate>) =>
      input.id
        ? http.patch<GameTemplate>(`/admin/templates/${input.id}`, input)
        : http.post<GameTemplate>("/admin/templates", input),

    auditLogs: (query?: { actorId?: string; targetType?: string; page?: number }) =>
      http.get<Paginated<AuditLog>>("/admin/audit-logs", { query }),

    alerts: () => http.get<GlobalAlert[]>("/admin/alerts"),
    saveAlert: (input: Partial<GlobalAlert>) =>
      input.id
        ? http.patch<GlobalAlert>(`/admin/alerts/${input.id}`, input)
        : http.post<GlobalAlert>("/admin/alerts", input),
    deleteAlert: (id: string) => http.delete<void>(`/admin/alerts/${id}`),

    metrics: () =>
      http.get<{
        nodes: { id: string; name: string; cpuPct: number; memPct: number; diskPct: number }[];
        totals: { servers: number; users: number; revenueMinor: number; openTickets: number };
      }>("/admin/metrics"),
  },
};

export type Api = typeof api;
