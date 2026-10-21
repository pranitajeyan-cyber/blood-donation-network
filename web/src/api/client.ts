import type {
  AcceptResponse,
  AccuracyReport,
  AuditEntry,
  BacktestOut,
  BagOut,
  ConsumptionBody,
  DonationBody,
  DonorUpdateBody,
  EligibilityOut,
  EscalationOutcome,
  ForecastPoint,
  HospitalOut,
  InventoryAdjustBody,
  InventoryItem,
  LoginBody,
  MatchOut,
  MetricsOut,
  PlatformPulse,
  PlatformSpec,
  RegisterBody,
  RequestCreateBody,
  RequestOut,
  TokenResponse,
  UserOut,
} from './types'

/**
 * A single place where every network call happens.
 *
 * In development Vite proxies `/api` to the FastAPI process; in production the
 * SPA is served by FastAPI itself, so the same relative path works with no
 * configuration. `VITE_API_BASE` exists only for the rare case where the API
 * lives on a different host.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

const TOKEN_KEY = 'bdn.token'

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode — the session simply won't survive a reload */
  }
}

/** Pull a human-readable message out of FastAPI's error shapes. */
function describe(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload
  if (payload && typeof payload === 'object') {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string }
      if (first?.msg) return first.msg
    }
  }
  return fallback
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const bearer = token ?? readToken()
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(
      0,
      'Cannot reach the API. Is the backend running on port 8000?',
    )
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      describe(payload, `Request failed with status ${response.status}`),
    )
  }

  return payload as T
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

export const api = {
  /* --- public ------------------------------------------------------------ */
  spec: () => request<PlatformSpec>('/meta/spec'),
  pulse: () => request<PlatformPulse>('/meta/pulse'),
  accuracy: () => request<AccuracyReport>('/meta/accuracy'),

  /* --- auth -------------------------------------------------------------- */
  login: (body: LoginBody) =>
    request<TokenResponse>('/auth/login', { method: 'POST', ...json(body) }),
  register: (body: RegisterBody) =>
    request<TokenResponse>('/auth/register', { method: 'POST', ...json(body) }),
  me: (token?: string) => request<UserOut>('/auth/me', {}, token),

  /* --- donor ------------------------------------------------------------- */
  donorProfile: () => request<UserOut>('/donors/me'),
  updateDonor: (patch: DonorUpdateBody) =>
    request<UserOut>('/donors/me', { method: 'PATCH', ...json(patch) }),
  verifyDonor: (digilocker_token: string) =>
    request<UserOut>('/donors/me/verify', {
      method: 'POST',
      ...json({ digilocker_token }),
    }),
  eligibility: () => request<EligibilityOut>('/donors/me/eligibility'),
  myMatches: () => request<MatchOut[]>('/donors/me/matches'),
  myBags: () => request<BagOut[]>('/donors/me/bags'),
  recordOwnDonation: () =>
    request<EligibilityOut>('/donors/me/cooldown', { method: 'POST' }),

  /* --- requests ---------------------------------------------------------- */
  requests: (status?: string) =>
    request<RequestOut[]>(
      status ? `/requests?status_filter=${encodeURIComponent(status)}` : '/requests',
    ),
  request: (id: number) => request<RequestOut>(`/requests/${id}`),
  createRequest: (body: RequestCreateBody) =>
    request<RequestOut>('/requests', { method: 'POST', ...json(body) }),
  requestMatches: (id: number) => request<MatchOut[]>(`/requests/${id}/matches`),
  escalateRequest: (id: number) =>
    request<EscalationOutcome>(`/requests/${id}/escalate`, { method: 'POST' }),
  cancelRequest: (id: number) =>
    request<RequestOut>(`/requests/${id}/cancel`, { method: 'POST' }),

  acceptMatch: (matchId: number) =>
    request<AcceptResponse>(`/matches/${matchId}/accept`, { method: 'POST' }),
  declineMatch: (matchId: number) =>
    request<AcceptResponse>(`/matches/${matchId}/decline`, { method: 'POST' }),

  /* --- hospital ---------------------------------------------------------- */
  hospital: () => request<HospitalOut>('/hospitals/me'),
  inventory: () => request<InventoryItem[]>('/hospitals/me/inventory'),
  setInventory: (blood_group: string, units_in_stock: number) =>
    request<InventoryItem>('/hospitals/me/inventory', {
      method: 'PUT',
      ...json({ blood_group, units_in_stock }),
    }),
  adjustInventory: (body: InventoryAdjustBody) =>
    request<InventoryItem>('/hospitals/me/inventory/adjust', {
      method: 'POST',
      ...json(body),
    }),
  logConsumption: (body: ConsumptionBody) =>
    request<{ id: number; blood_group: string; log_date: string }>(
      '/hospitals/me/consumption',
      { method: 'POST', ...json(body) },
    ),
  recordDonation: (body: DonationBody) =>
    request<{
      bag_code: string
      donor_id: number
      request_id: number
      units_fulfilled: number
      units_needed: number
      status: string
      eligible_again_at: string
    }>('/hospitals/me/donations', { method: 'POST', ...json(body) }),

  /* --- admin ------------------------------------------------------------- */
  metrics: () => request<MetricsOut>('/admin/metrics'),
  forecast: (horizonDays = 7) =>
    request<ForecastPoint[]>(`/admin/forecast?horizon_days=${horizonDays}`),
  backtest: (model: 'adjusted_ma' | 'seasonal_naive', horizon = 7) =>
    request<BacktestOut[]>(
      `/admin/backtest?model=${model}&horizon=${horizon}`,
    ),
  runEscalation: () =>
    request<EscalationOutcome[]>('/admin/escalate', { method: 'POST' }),
  users: (role?: string) =>
    request<UserOut[]>(role ? `/admin/users?role=${role}` : '/admin/users'),
  audit: (limit = 100) => request<AuditEntry[]>(`/admin/audit?limit=${limit}`),
}
