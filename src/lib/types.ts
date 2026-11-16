export type Role = 'admin' | 'responder' | 'consumer'

export type ReportType = 'water' | 'electricity' | 'fire'

export type ReportStatus =
  | 'new'
  | 'triaged'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'cancelled'
  | 'duplicate'

export type Priority = 'low' | 'medium' | 'high' | 'critical'

export type AssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'declined'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role: Role
  zone: string | null
  is_active: boolean
  created_at: string
  address_text?: string | null
  address_lat?: number | null
  address_lng?: number | null
  selfie_path?: string | null
  id_photo_path?: string | null
  terms_accepted_at?: string | null
  terms_version?: string | null
  verification_status?: VerificationStatus
}

export interface ReportRow {
  id: string
  ticket_no: number
  type: ReportType
  status: ReportStatus
  priority: Priority
  is_emergency: boolean
  is_sos?: boolean
  description: string | null
  photo_path: string | null
  address_text: string | null
  lat: number | null
  lng: number | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  reporter_id: string
  reporter_name: string | null
  reporter_phone: string | null
  reporter_verification_status?: VerificationStatus | null
  assignment_id: string | null
  assignment_status: AssignmentStatus | null
  responder_id: string | null
  responder_name: string | null
  responder_phone: string | null
  age_minutes: number | null
}

export interface ReportEvent {
  id: number
  report_id: string
  author_id: string | null
  kind: 'comment' | 'status' | 'assignment' | 'photo' | 'system'
  message: string | null
  photo_path: string | null
  created_at: string
}

export interface ResponderOption {
  id: string
  full_name: string
  phone: string | null
  zone: string | null
}

export interface ReportDetail {
  report: ReportRow
  events: Array<ReportEvent & { author_name: string | null }>
  responders: ResponderOption[]
  photoUrl: string | null
}
