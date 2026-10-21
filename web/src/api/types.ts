/**
 * TypeScript mirrors of the Pydantic schemas in `app/schemas.py`.
 *
 * Every field name here matches the backend contract exactly — if you change
 * one, change the other. The backend is the source of truth.
 */

export type Role = 'donor' | 'hospital' | 'admin'

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'

export type RequestStatus = 'OPEN' | 'MATCHED' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED'

export type MatchStatus = 'NOTIFIED' | 'ACCEPTED' | 'DECLINED' | 'CONFIRMED' | 'EXPIRED'

export type Urgency = 'NORMAL' | 'URGENT' | 'EMERGENCY'

export interface UserOut {
  id: number
  name: string
  email: string
  phone: string
  role: Role
  blood_group: BloodGroup | null
  district: string | null
  verified: boolean
  is_available: boolean
  last_donation_at: string | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserOut
}

export interface EligibilityOut {
  donor_id: number
  blood_group: BloodGroup | null
  eligible: boolean
  eligible_again_at: string | null
  days_until_eligible: number
}

export interface MatchOut {
  id: number
  request_id: number
  donor_id: number
  donor_name: string
  blood_group: BloodGroup | null
  distance_km: number
  status: MatchStatus
  notified_at: string
  responded_at: string | null
}

export interface BagOut {
  id: number
  bag_code: string
  blood_group: BloodGroup
  units: number
  status: string
  donated_at: string
  hospital_name?: string | null
}

export interface HospitalOut {
  id: number
  name: string
  license_no: string
  district: string
  latitude: number
  longitude: number
  verified: boolean
}

export interface InventoryItem {
  blood_group: BloodGroup
  units_in_stock: number
}

export interface RequestOut {
  id: number
  hospital_id: number
  blood_group: BloodGroup
  units_needed: number
  units_fulfilled: number
  urgency: Urgency
  status: RequestStatus
  district: string
  latitude: number
  longitude: number
  radius_km: number
  escalation_tier: number
  caregiver_alerted: boolean
  notes: string | null
  expires_at: string
  created_at: string
}

export interface AcceptResponse {
  match_id: number
  request_id: number
  status: MatchStatus
  distance_km: number
  message: string
}

export interface ForecastPoint {
  district: string
  blood_group: BloodGroup
  forecast_date: string
  predicted_units: number
  stock_units: number
  risk: string
  wmape: number | null
}

export interface BacktestOut {
  district: string
  blood_group: BloodGroup
  wmape: number
  mae: number
  samples: number
  horizon: number
}

export interface MetricsOut {
  open_requests: number
  matches_created: number
  matches_accepted: number
  median_match_to_donation_minutes: number | null
  donor_repeat_rate: number
  units_fulfilled: number
}

export interface EscalationOutcome {
  request_id: number
  previous_tier: number
  current_tier: number
  radius_km: number
  donors_notified: number
  caregiver_alerted: boolean
  expired: boolean
  action: string
}

export interface AuditEntry {
  id: number
  actor_id: number | null
  action: string
  entity: string
  entity_id: string | null
  detail: string | null
  created_at: string
}

/* --- public metadata (GET /api/meta/*) --------------------------------- */

export interface PlatformSpec {
  app_name: string
  version: string
  blood_groups: BloodGroup[]
  escalation: {
    tier_minutes: number[]
    radii_km: number[]
    caregiver_escalation_minutes: number
  }
  donor_lock_days: number
  request_ttl_hours: number
  forecast_horizon_days: number
}

export interface PlatformPulse {
  donors_total: number
  donors_verified: number
  donors_available: number
  hospitals: number
  open_requests: number
  fulfilled_requests: number
  units_fulfilled: number
  bags_tracked: number
}

export interface AccuracyReport {
  horizon_days: number
  backtest_split: number
  series_scored: number
  mean_wmape: {
    adjusted_ma: number | null
    seasonal_naive: number | null
  }
  rows: {
    district: string
    blood_group: BloodGroup
    adjusted_ma: number
    seasonal_naive: number
  }[]
}

/* --- request bodies ----------------------------------------------------- */

export interface LoginBody {
  email: string
  password: string
}

export interface DonorUpdateBody {
  blood_group?: BloodGroup | null
  district?: string | null
  latitude?: number | null
  longitude?: number | null
  is_available?: boolean
}

export interface RegisterBody {
  name: string
  email: string
  phone: string
  password: string
  blood_group?: BloodGroup | null
  district?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface RequestCreateBody {
  blood_group: BloodGroup
  units_needed: number
  urgency: Urgency
  notes?: string | null
}

export interface ConsumptionBody {
  blood_group: BloodGroup
  units_consumed: number
  log_date?: string | null
  is_festival?: boolean
}

export interface DonationBody {
  request_id: number
  donor_id: number
  units?: number
  bag_code?: string | null
}

export interface InventoryAdjustBody {
  blood_group: BloodGroup
  delta: number
}
