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
  NodePing,
  Region,
  Notification,
  Paginated,
  PaymentMethod,
  Price,
  BillingInterval,
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
  TicketCategory,
  CannedResponse,
  StaffMember,
  User,
  FileEntry,
  AuditLog,
  GlobalAlert,
  AdminServer,
  StorefrontGame,
  StorefrontGameDetail,
  HomepageAlert,
  ModrinthProject,
  ModrinthVersion,
  AdminUserDetail,
  AdminCustomer,
  AdminInvoice,
  AdminSubscription,
  AdminPayment,
  AdminBillingSummary,
  GatewayStatus,
  GatewayConfigDetail,
  EmailConfigDetail,
  Coupon,
  CouponKind,
  GiftCard,
  CreditLedger,
  CreditReason,
  ProfileUpdate,
  AdminRole,
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
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: AuthTokens }
        | AuthTokens
        | null;
      const data = ((json as { data?: AuthTokens } | null)?.data ??
        json) as AuthTokens | null;
      if (data?.accessToken) {
        setTokens(data);
        return data;
      }
    }
    // Only a definitive auth rejection means the refresh token is actually
    // invalid → clear it. Transient failures (panel restarting: 5xx / network)
    // keep the session so the user stays signed in once the panel returns.
    if (res.status === 401 || res.status === 403) {
      clearTokens();
      // Tell the app the session is truly over so it can redirect to /login
      // immediately rather than showing empty data until a manual refresh.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("refx:session-expired"));
      }
    }
    return null;
  } catch {
    // Network error (e.g. the panel is mid-rebuild) — transient, keep tokens.
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
    // Don't clear here — doRefresh() already cleared tokens iff the refresh
    // token was genuinely invalid (vs. a transient panel outage).
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();

  // unwrap below after error handling

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

  // The panel-api wraps successful REST responses in a { success, data }
  // envelope ({ success, data, meta } for paginated). Unwrap so callers receive
  // the payload (or { data, meta }) directly.
  if (
    isJson &&
    data &&
    typeof data === "object" &&
    (data as { success?: unknown }).success === true &&
    "data" in (data as object)
  ) {
    const env = data as { success: true; data: unknown; meta?: unknown };
    return (env.meta !== undefined
      ? { data: env.data, meta: env.meta }
      : env.data) as T;
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

/**
 * GET a list endpoint and always return a bare array, whether the panel-api
 * responds with a plain array or a paginated `{ data, meta }` envelope. (List
 * endpoints that need the pagination meta are typed `Paginated<T>` and use
 * `http.get` directly.)
 */
async function getList<T>(path: string, opts?: RequestOptions): Promise<T[]> {
  const r = await request<T[] | Paginated<T>>(path, { ...opts, method: "GET" });
  return Array.isArray(r) ? r : (r?.data ?? []);
}

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
    update: (input: ProfileUpdate) => http.patch<User>("/account", input),
    changePassword: (currentPassword: string, newPassword: string) =>
      http.post<void>("/account/password", { currentPassword, newPassword }),
    sessions: () => getList<Session>("/account/sessions"),
    revokeSession: (id: string) => http.delete<void>(`/account/sessions/${id}`),
    apiKeys: () => getList<ApiKey>("/account/api-keys"),
    createApiKey: (input: { name: string; scopes: ApiKey["scopes"] }) =>
      http.post<ApiKey>("/account/api-keys", input),
    revokeApiKey: (id: string) => http.delete<void>(`/account/api-keys/${id}`),
    // MFA management. TODO(impl): WebAuthn registration ceremony.
    totpSetup: () => http.post<{ secret: string; otpauthUrl: string }>("/account/mfa/totp/setup"),
    totpEnable: (code: string) =>
      http.post<{ recoveryCodes: string[] }>("/account/mfa/totp/enable", { code }),
    totpDisable: (code: string) => http.post<void>("/account/mfa/totp/disable", { code }),
    notifications: () => getList<Notification>("/account/notifications"),
    markNotificationRead: (id: string) =>
      http.post<void>(`/account/notifications/${id}/read`),
  },

  servers: {
    list: (query?: { search?: string; state?: string }) =>
      getList<Server>("/servers", { query }),
    get: (id: string) => http.get<Server>(`/servers/${id}`),
    stats: (id: string) => http.get<ServerStat>(`/servers/${id}/stats`),
    statsHistory: (id: string, range = "1h") =>
      getList<ServerStat>(`/servers/${id}/stats/history`, { query: { range } }),
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
    changeMinecraftVersion: (id: string, version: string) =>
      http.patch<{ accepted: true; version: string }>(
        `/servers/${id}/minecraft-version`,
        { version },
      ),
    setMinecraft: (
      id: string,
      input: { loader: string; version?: string; loaderVersion?: string },
    ) =>
      http.patch<{ accepted: true; loader: string; version: string }>(
        `/servers/${id}/minecraft`,
        input,
      ),
    mods: {
      context: (id: string) =>
        http.get<{ loader: string; kind: "mod" | "plugin"; directory: string; gameVersion: string }>(
          `/servers/${id}/mods/context`,
        ),
      search: (id: string, q: string) =>
        getList<ModrinthProject>(`/servers/${id}/mods/search`, { query: { q } }),
      versions: (id: string, projectId: string) =>
        getList<ModrinthVersion>(`/servers/${id}/mods/versions`, {
          query: { projectId },
        }),
      installed: (id: string) =>
        http.get<{ directory: string; files: { name: string; size: number }[] }>(
          `/servers/${id}/mods/installed`,
        ),
      install: (id: string, input: { projectId?: string; versionId?: string }) =>
        http.post<{ installed: true; filename: string; directory: string }>(
          `/servers/${id}/mods/install`,
          input,
        ),
      remove: (id: string, filename: string) =>
        http.delete<{ removed: true }>(
          `/servers/${id}/mods/${encodeURIComponent(filename)}`,
        ),
    },
    // Modrinth modpacks (.mrpack) — installing one switches the server's MC
    // version + loader automatically, then provisions the pack's mods/config.
    modpacks: {
      search: (id: string, q: string) =>
        getList<ModrinthProject>(`/servers/${id}/modpacks/search`, { query: { q } }),
      versions: (id: string, projectId: string) =>
        getList<ModrinthVersion>(`/servers/${id}/modpacks/versions`, {
          query: { projectId },
        }),
      install: (id: string, versionId: string) =>
        http.post<{ accepted: true }>(`/servers/${id}/modpacks/install`, { versionId }),
    },
    sftp: (id: string) =>
      http.get<{ host: string; port: number; username: string }>(`/servers/${id}/sftp`),
    rotateSftp: (id: string) =>
      http.post<{ password: string }>(`/servers/${id}/sftp/rotate`),

    // Game switching — the signature flow.
    switchableTemplates: (id: string) =>
      getList<GameTemplate>(`/servers/${id}/switch-game/templates`),
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
    subUsers: (id: string) => getList<SubUser>(`/servers/${id}/sub-users`),
    addSubUser: (id: string, input: { email: string; permissions: string[] }) =>
      http.post<SubUser>(`/servers/${id}/sub-users`, input),
    updateSubUser: (id: string, subId: string, permissions: string[]) =>
      http.patch<SubUser>(`/servers/${id}/sub-users/${subId}`, { permissions }),
    removeSubUser: (id: string, subId: string) =>
      http.delete<void>(`/servers/${id}/sub-users/${subId}`),

    // Files
    files: {
      list: (id: string, path = "/") =>
        getList<FileEntry>(`/servers/${id}/files/list`, { query: { path } }),
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
      list: (id: string) => getList<Backup>(`/servers/${id}/backups`),
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
      list: (id: string) => getList<ServerDatabase>(`/servers/${id}/databases`),
      create: (id: string, input: { engine: ServerDatabase["engine"]; name: string; remoteAccess?: string }) =>
        http.post<ServerDatabase>(`/servers/${id}/databases`, input),
      rotatePassword: (id: string, dbId: string) =>
        http.post<{ password: string }>(`/servers/${id}/databases/${dbId}/rotate`),
      delete: (id: string, dbId: string) =>
        http.delete<void>(`/servers/${id}/databases/${dbId}`),
    },

    // Schedules
    schedules: {
      list: (id: string) => getList<Schedule>(`/servers/${id}/schedules`),
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
    products: (query?: { type?: string }) => getList<Product>("/catalog/products", { query }),
    product: (slug: string) => http.get<Product>(`/catalog/products/${slug}`),
    // Regions with an online node that has room for the given config.
    locations: (limits: { cpuCores: number; memoryMb: number; diskMb: number }) =>
      getList<Region>("/catalog/locations", {
        query: {
          cpuCores: limits.cpuCores,
          memoryMb: limits.memoryMb,
          diskMb: limits.diskMb,
        },
      }),
    categories: () => getList<GameCategory>("/catalog/categories"),
    templates: (query?: { categoryId?: string; search?: string }) =>
      getList<GameTemplate>("/catalog/templates", { query }),
    minecraftVersions: () =>
      http.get<{ versions: string[] }>("/catalog/minecraft-versions", {
        anonymous: true,
      }),
    // Public storefront (unauthenticated).
    games: () => getList<StorefrontGame>("/catalog/games", { anonymous: true }),
    game: (slug: string) =>
      http.get<StorefrontGameDetail>(`/catalog/games/${slug}`, { anonymous: true }),
    homepageAlerts: () =>
      getList<HomepageAlert>("/catalog/homepage-alerts", { anonymous: true }),
  },

  orders: {
    // Creates a checkout session / provisions a server. TODO(impl): Stripe redirect.
    create: (input: {
      productId: string;
      priceId: string;
      templateId: string;
      regionId?: string;
      slots?: number;
      name: string;
      gateway?: "stripe" | "paypal";
      environment?: Record<string, string>;
      couponCode?: string;
      giftCardCode?: string;
      useCredit?: boolean;
    }) => http.post<{ checkoutUrl?: string; serverId?: string; invoiceId?: string; paid?: boolean }>("/orders", input),
  },

  billing: {
    /** Public-safe gateway config for the checkout button (Stripe publishable key). */
    config: () => http.get<GatewayStatus>("/billing/config"),
    validateCoupon: (code: string, subtotalMinor: number) =>
      http.post<{ valid: boolean; code: string; kind: CouponKind; value: number; discountMinor: number }>(
        "/billing/coupons/validate",
        { code, subtotalMinor },
      ),
    lookupGiftCard: (code: string) =>
      http.post<{ code: string; balanceMinor: number; currency: string }>(
        "/billing/gift-cards/lookup",
        { code },
      ),
    /** The caller's store-credit balance + recent ledger. */
    credit: () => http.get<CreditLedger>("/billing/credit"),
    invoices: () => getList<Invoice>("/billing/invoices"),
    invoice: (id: string) => http.get<Invoice>(`/billing/invoices/${id}`),
    payInvoice: (id: string, gateway?: "stripe" | "paypal") =>
      http.post<{ paid?: boolean; checkoutUrl?: string }>(
        `/billing/invoices/${id}/pay`,
        undefined,
        { query: gateway ? { gateway } : undefined },
      ),
    payForServer: (serverId: string, gateway?: "stripe" | "paypal") =>
      http.post<{ paid?: boolean; checkoutUrl?: string }>(
        `/billing/servers/${serverId}/pay`,
        undefined,
        { query: gateway ? { gateway } : undefined },
      ),
    // Capture an approved PayPal order on return (token = PayPal order id).
    capturePaypal: (token: string) =>
      http.post<{ paid: boolean }>(`/billing/paypal/capture`, undefined, {
        query: { token },
      }),
    subscriptions: () => getList<Subscription>("/billing/subscriptions"),
    cancelSubscription: (id: string, atPeriodEnd = true) =>
      http.post<Subscription>(`/billing/subscriptions/${id}/cancel`, { atPeriodEnd }),
    resumeSubscription: (id: string) =>
      http.post<Subscription>(`/billing/subscriptions/${id}/resume`),
    paymentMethods: () => getList<PaymentMethod>("/billing/payment-methods"),
    addPaymentMethodUrl: () =>
      http.post<{ url: string }>("/billing/payment-methods/setup"),
    setDefaultPaymentMethod: (id: string) =>
      http.post<void>(`/billing/payment-methods/${id}/default`),
    removePaymentMethod: (id: string) =>
      http.delete<void>(`/billing/payment-methods/${id}`),
  },

  support: {
    tickets: (query?: { state?: string; priority?: string; q?: string; page?: number }) =>
      http.get<Paginated<Ticket>>("/support/tickets", { query }),
    ticket: (id: string) =>
      http.get<Ticket & { messages: TicketMessage[] }>(`/support/tickets/${id}`),
    createTicket: (input: { subject: string; body: string; priority?: string; categoryId?: string }) =>
      http.post<Ticket>("/support/tickets", input),
    reply: (id: string, body: string, isInternal = false) =>
      http.post<TicketMessage>(`/support/tickets/${id}/messages`, { body, isInternal }),
    // Staff workflow: state / priority / category / assignee.
    updateTicket: (
      id: string,
      input: Partial<{
        state: Ticket["state"];
        priority: Ticket["priority"];
        categoryId: string | null;
        assigneeId: string | null;
      }>,
    ) => http.patch<Ticket>(`/support/tickets/${id}`, input),
    setState: (id: string, state: Ticket["state"]) =>
      http.patch<Ticket>(`/support/tickets/${id}`, { state }),
    assign: (id: string, assigneeId: string) =>
      http.post<Ticket>(`/support/tickets/${id}/assign`, { assigneeId }),
    // Storage / cleanup of past tickets (staff).
    archiveTicket: (id: string) =>
      http.post<Ticket>(`/support/tickets/${id}/archive`),
    deleteTicket: (id: string) => http.delete<void>(`/support/tickets/${id}`),
    staff: () => getList<StaffMember>("/support/staff"),
    categories: () => getList<TicketCategory>("/support/categories"),
    createCategory: (input: { name: string; slug: string; slaFirstResponseMin?: number; slaResolutionMin?: number }) =>
      http.post<TicketCategory>("/support/categories", input),
    updateCategory: (
      id: string,
      input: Partial<{ name: string; slug: string; slaFirstResponseMin: number; slaResolutionMin: number }>,
    ) => http.patch<TicketCategory>(`/support/categories/${id}`, input),
    deleteCategory: (id: string) => http.delete<void>(`/support/categories/${id}`),
    cannedResponses: () => getList<CannedResponse>("/support/canned-responses"),
    createCannedResponse: (input: { title: string; body: string; tags?: string[] }) =>
      http.post<CannedResponse>("/support/canned-responses", input),
    updateCannedResponse: (
      id: string,
      input: Partial<{ title: string; body: string; tags: string[] }>,
    ) => http.patch<CannedResponse>(`/support/canned-responses/${id}`, input),
    deleteCannedResponse: (id: string) =>
      http.delete<void>(`/support/canned-responses/${id}`),
    kb: (query?: { search?: string; category?: string }) =>
      getList<KbArticle>("/support/kb", { query }),
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
    nodes: () => getList<Node>("/admin/nodes"),
    regions: () => getList<Region>("/admin/nodes/regions"),
    node: (id: string) => http.get<Node>(`/admin/nodes/${id}`),
    nodeHeartbeats: (id: string, range = "1h") =>
      getList<NodeHeartbeat>(`/admin/nodes/${id}/heartbeats`, { query: { range } }),
    nodePing: (id: string) => http.get<NodePing>(`/admin/nodes/${id}/ping`),
    restartNodeAgent: (id: string) =>
      http.post<{ restarting: true }>(`/admin/nodes/${id}/restart-agent`),
    createNode: (input: Partial<Node> & { regionId: string }) =>
      http.post<Node & { bootstrapToken: string }>("/admin/nodes", input),
    setNodeMaintenance: (id: string, maintenance: boolean) =>
      http.patch<Node>(`/admin/nodes/${id}`, { maintenance }),
    updateNode: (
      id: string,
      input: Partial<{
        cpuCores: number;
        memoryMb: number;
        diskMb: number;
        cpuOvercommit: number;
        memOvercommit: number;
        maintenance: boolean;
      }>,
    ) => http.patch<Node>(`/admin/nodes/${id}`, input),
    deleteNode: (id: string) => http.delete<void>(`/admin/nodes/${id}`),

    users: (query?: { q?: string; role?: string; state?: string }) =>
      http.get<Paginated<User>>("/admin/users", { query }),
    /** Paying customers (ACTIVE + PAID services) with per-row aggregates. */
    customers: (query?: { page?: number; q?: string }) =>
      http.get<Paginated<AdminCustomer>>("/admin/customers", { query }),
    userDetail: (id: string) => http.get<AdminUserDetail>(`/admin/users/${id}`),
    setUserState: (id: string, state: User["state"]) =>
      http.patch<User>(`/admin/users/${id}`, { state }),
    setUserRole: (id: string, input: { role?: User["globalRole"]; roleId?: string }) =>
      http.patch<User>(`/admin/users/${id}/role`, input),
    deleteUser: (id: string) => http.delete<void>(`/admin/users/${id}`),

    // Store credit (account balance) — view ledger + grant/deduct.
    userCredit: (id: string) => http.get<CreditLedger>(`/admin/users/${id}/credit`),
    grantCredit: (
      id: string,
      input: { amountMinor: number; reason?: CreditReason; note?: string },
    ) => http.post<{ balanceMinor: number }>(`/admin/users/${id}/credit`, input),

    // Roles & permissions (RBAC)
    roles: () => getList<AdminRole>("/admin/roles"),
    rolePermissions: () =>
      http.get<{ wildcard: string; permissions: string[] }>("/admin/roles/permissions"),
    createRole: (input: { key: string; name: string; description?: string; permissions: string[] }) =>
      http.post<AdminRole>("/admin/roles", input),
    updateRole: (id: string, input: Partial<{ name: string; description: string; permissions: string[] }>) =>
      http.patch<AdminRole>(`/admin/roles/${id}`, input),
    deleteRole: (id: string) => http.delete<void>(`/admin/roles/${id}`),

    // Locations (regions) — full CRUD; new locations feed the node-create picker.
    locations: () => getList<Region>("/admin/locations"),
    createLocation: (input: { code: string; name: string; country: string }) =>
      http.post<Region>("/admin/locations", input),
    updateLocation: (id: string, input: Partial<{ code: string; name: string; country: string }>) =>
      http.patch<Region>(`/admin/locations/${id}`, input),
    deleteLocation: (id: string) => http.delete<void>(`/admin/locations/${id}`),

    // Billing / orders / invoices / payments (payments are OWNER-only).
    billingSummary: () => http.get<AdminBillingSummary>("/admin/billing/summary"),
    orders: (query?: { page?: number; q?: string }) =>
      http.get<Paginated<AdminSubscription>>("/admin/orders", { query }),
    deleteOrder: (id: string) => http.delete<void>(`/admin/orders/${id}`),
    bulkDeleteOrders: (ids: string[]) =>
      http.post<{ deleted: string[]; skipped: { id: string; reason: string }[] }>(
        "/admin/orders/bulk-delete",
        { ids },
      ),
    invoices: (query?: { page?: number; q?: string; state?: string }) =>
      http.get<Paginated<AdminInvoice>>("/admin/invoices", { query }),
    voidInvoice: (id: string) => http.post<AdminInvoice>(`/admin/invoices/${id}/void`),
    deleteInvoice: (id: string) => http.delete<void>(`/admin/invoices/${id}`),
    payments: (query?: { page?: number; q?: string }) =>
      http.get<Paginated<AdminPayment>>("/admin/payments", { query }),
    paymentGateways: () => http.get<GatewayStatus>("/admin/payments/gateways"),
    gatewayConfig: () => http.get<GatewayConfigDetail>("/admin/payments/gateways/config"),
    setGatewayConfig: (input: {
      stripeSecretKey?: string;
      stripeWebhookSecret?: string;
      stripePublishableKey?: string;
      stripeStatementDescriptor?: string;
      paypalClientId?: string;
      paypalClientSecret?: string;
      paypalMode?: string;
      paypalWebhookId?: string;
    }) => http.patch<void>("/admin/payments/gateways/config", input),

    // Email / SMTP settings (settings.manage).
    emailConfig: () => http.get<EmailConfigDetail>("/admin/settings/email"),
    setEmailConfig: (input: {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      from?: string;
      secure?: boolean;
    }) => http.patch<void>("/admin/settings/email", input),
    sendTestEmail: (to: string) =>
      http.post<{ delivered: boolean }>("/admin/settings/email/test", { to }),

    // Coupons (billing.manage)
    coupons: () => getList<Coupon>("/admin/coupons"),
    createCoupon: (input: Partial<Coupon>) =>
      http.post<Coupon>("/admin/coupons", input),
    updateCoupon: ({ id, ...input }: Partial<Coupon>) =>
      http.patch<Coupon>(`/admin/coupons/${id}`, input),
    deleteCoupon: (id: string) => http.delete<void>(`/admin/coupons/${id}`),

    // Gift cards (billing.manage)
    giftCards: () => getList<GiftCard>("/admin/gift-cards"),
    createGiftCard: (input: { code?: string; initialBalanceMinor: number; currency?: string; note?: string; expiresAt?: string }) =>
      http.post<GiftCard>("/admin/gift-cards", input),
    updateGiftCard: (id: string, input: Partial<{ isActive: boolean; note: string; expiresAt: string }>) =>
      http.patch<GiftCard>(`/admin/gift-cards/${id}`, input),

    products: () => getList<Product>("/admin/products"),
    // Strip `id` from the body — it's in the URL on update, and the API rejects
    // unknown fields (forbidNonWhitelisted) so `id` in the payload 400s.
    saveProduct: ({ id, ...body }: Partial<Product>) =>
      id
        ? http.patch<Product>(`/admin/products/${id}`, body)
        : http.post<Product>("/admin/products", body),
    deleteProduct: (id: string) => http.delete<void>(`/admin/products/${id}`),

    // Per-product, per-interval pricing.
    createPrice: (
      productId: string,
      input: { interval: BillingInterval; currency?: string; amountMinor: number; stripePriceId?: string; isActive?: boolean },
    ) => http.post<Price>(`/admin/products/${productId}/prices`, input),
    updatePrice: (
      priceId: string,
      input: Partial<{ interval: BillingInterval; currency: string; amountMinor: number; stripePriceId: string; isActive: boolean }>,
    ) => http.patch<Price>(`/admin/prices/${priceId}`, input),
    deletePrice: (priceId: string) => http.delete<void>(`/admin/prices/${priceId}`),

    servers: () => getList<AdminServer>("/admin/servers"),
    createServer: (input: {
      name: string;
      ownerId: string;
      nodeId: string;
      templateId: string;
      cpuCores: number;
      memoryMb: number;
      diskMb: number;
      swapMb?: number;
      environment?: Record<string, string>;
    }) => http.post<Server>("/admin/servers", input),
    deleteServer: (id: string) => http.delete<void>(`/admin/servers/${id}`),

    templates: () => getList<GameTemplate>("/admin/templates"),
    saveTemplate: ({ id, ...body }: Partial<GameTemplate>) =>
      id
        ? http.patch<GameTemplate>(`/admin/templates/${id}`, body)
        : http.post<GameTemplate>("/admin/templates", body),

    homepageAlerts: () => getList<HomepageAlert>("/admin/homepage-alerts"),
    saveHomepageAlert: ({ id, ...body }: Partial<HomepageAlert>) =>
      id
        ? http.patch<HomepageAlert>(`/admin/homepage-alerts/${id}`, body)
        : http.post<HomepageAlert>("/admin/homepage-alerts", body),
    deleteHomepageAlert: (id: string) =>
      http.delete<void>(`/admin/homepage-alerts/${id}`),

    auditLogs: (query?: { actorId?: string; targetType?: string; page?: number }) =>
      http.get<Paginated<AuditLog>>("/admin/audit-logs", { query }),

    alerts: () => getList<GlobalAlert>("/admin/alerts"),
    saveAlert: ({ id, ...body }: Partial<GlobalAlert>) =>
      id
        ? http.patch<GlobalAlert>(`/admin/alerts/${id}`, body)
        : http.post<GlobalAlert>("/admin/alerts", body),
    deleteAlert: (id: string) => http.delete<void>(`/admin/alerts/${id}`),

    metrics: () =>
      http.get<{
        nodes: { id: string; name: string; cpuPct: number; memPct: number; diskPct: number }[];
        totals: { servers: number; users: number; revenueMinor: number; openTickets: number };
      }>("/admin/metrics"),
  },
};

export type Api = typeof api;
