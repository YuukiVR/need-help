import { supabase } from './supabase'
import { startOfTodayIso } from './format'
import { DEMO_ADMIN, DEMO_MODE } from './flags'
import type {
  Priority,
  Profile,
  ReportDetail,
  ReportEvent,
  ReportRow,
  ReportStatus,
  ReportType,
  ResponderOption,
  Role,
} from './types'

// ─── Profiles ─────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (DEMO_MODE) return userId === DEMO_ADMIN.id ? DEMO_ADMIN : null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as Profile | null) ?? null
}

export async function fetchUsers(params: {
  search: string
  role: Role | 'all'
  page: number
  pageSize: number
}): Promise<{ rows: Profile[]; total: number }> {
  if (DEMO_MODE) {
    const { demoFetchUsers } = await import('./demo')
    return demoFetchUsers(params)
  }

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  let query = supabase.from('profiles').select('*', { count: 'exact' })

  if (params.role !== 'all') query = query.eq('role', params.role)

  const search = params.search.trim().replace(/[,()%\\]/g, ' ').trim()
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
    )
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { rows: (data ?? []) as Profile[], total: count ?? 0 }
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'role' | 'is_active' | 'zone' | 'phone'>>,
): Promise<void> {
  if (DEMO_MODE) {
    const { demoUpdateProfile } = await import('./demo')
    demoUpdateProfile(id, patch)
    return
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

// ─── Dashboard ────────────────────────────────────────────────────────

export interface DashboardData {
  open: number
  inProgress: number
  emergency: number
  resolvedToday: number
  total: number
  responders: number
  consumers: number
  byType: Record<ReportType, number>
  recent: ReportRow[]
  attention: ReportRow[]
}

async function countReports(apply?: (query: any) => any): Promise<number> {
  let query: any = supabase.from('reports').select('id', { count: 'exact', head: true })
  if (apply) query = apply(query)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function countProfiles(role: Role): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', role)
    .eq('is_active', true)

  if (error) throw error
  return count ?? 0
}

export async function fetchDashboard(): Promise<DashboardData> {
  if (DEMO_MODE) {
    const { demoFetchDashboard } = await import('./demo')
    return demoFetchDashboard()
  }

  const [
    open,
    inProgress,
    emergency,
    resolvedToday,
    total,
    responders,
    consumers,
    water,
    electricity,
    fire,
    recent,
    attention,
  ] = await Promise.all([
    countReports((q) => q.in('status', ['new', 'triaged', 'assigned'])),
    countReports((q) => q.eq('status', 'in_progress')),
    countReports((q) =>
      q.eq('is_emergency', true).in('status', ['new', 'triaged', 'assigned', 'in_progress']),
    ),
    countReports((q) => q.gte('resolved_at', startOfTodayIso())),
    countReports(),
    countProfiles('responder'),
    countProfiles('consumer'),
    countReports((q) => q.eq('type', 'water')),
    countReports((q) => q.eq('type', 'electricity')),
    countReports((q) => q.eq('type', 'fire')),
    supabase
      .from('report_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('report_queue')
      .select('*')
      .in('status', ['new', 'triaged'])
      .order('is_emergency', { ascending: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5),
  ])

  if (recent.error) throw recent.error
  if (attention.error) throw attention.error

  return {
    open,
    inProgress,
    emergency,
    resolvedToday,
    total,
    responders,
    consumers,
    byType: { water, electricity, fire },
    recent: (recent.data ?? []) as ReportRow[],
    attention: (attention.data ?? []) as ReportRow[],
  }
}

// ─── Reports ──────────────────────────────────────────────────────────

export interface ReportFilters {
  status: ReportStatus | 'all'
  type: ReportType | 'all'
  priority: Priority | 'all'
  search: string
  page: number
  pageSize: number
}

export async function fetchReports(
  filters: ReportFilters,
): Promise<{ rows: ReportRow[]; total: number }> {
  if (DEMO_MODE) {
    const { demoFetchReports } = await import('./demo')
    return demoFetchReports(filters)
  }

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  let query = supabase.from('report_queue').select('*', { count: 'exact' })

  if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.type !== 'all') query = query.eq('type', filters.type)
  if (filters.priority !== 'all') query = query.eq('priority', filters.priority)

  const search = filters.search.trim().replace(/[,()%\\]/g, ' ').trim()
  if (search) {
    const parts = [
      `address_text.ilike.%${search}%`,
      `description.ilike.%${search}%`,
      `reporter_name.ilike.%${search}%`,
    ]
    if (/^\d+$/.test(search)) parts.push(`ticket_no.eq.${Number(search)}`)
    query = query.or(parts.join(','))
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { rows: (data ?? []) as ReportRow[], total: count ?? 0 }
}

export async function fetchReportDetail(reportId: string): Promise<ReportDetail> {
  if (DEMO_MODE) {
    const { demoFetchReportDetail } = await import('./demo')
    return demoFetchReportDetail(reportId)
  }

  const [reportResult, eventsResult, respondersResult] = await Promise.all([
    supabase.from('report_queue').select('*').eq('id', reportId).maybeSingle(),
    supabase
      .from('report_events')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, phone, zone')
      .eq('role', 'responder')
      .eq('is_active', true)
      .order('full_name'),
  ])

  if (reportResult.error) throw reportResult.error
  if (eventsResult.error) throw eventsResult.error
  if (respondersResult.error) throw respondersResult.error
  if (!reportResult.data) throw new Error('Report not found.')

  const report = reportResult.data as ReportRow
  const events = (eventsResult.data ?? []) as ReportEvent[]

  const authorIds = [...new Set(events.map((event) => event.author_id).filter(Boolean))] as string[]
  let authorNames = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds)
    authorNames = new Map((authors ?? []).map((author) => [author.id, author.full_name]))
  }

  let photoUrl: string | null = null
  if (report.photo_path) {
    const { data } = await supabase.storage
      .from('report-photos')
      .createSignedUrl(report.photo_path, 60 * 60)
    photoUrl = data?.signedUrl ?? null
  }

  return {
    report,
    events: events.map((event) => ({
      ...event,
      author_name: event.author_id ? authorNames.get(event.author_id) ?? null : null,
    })),
    responders: (respondersResult.data ?? []) as ResponderOption[],
    photoUrl,
  }
}

export async function assignReport(
  reportId: string,
  responderId: string,
  note?: string,
): Promise<void> {
  if (DEMO_MODE) {
    const { demoAssignReport } = await import('./demo')
    demoAssignReport(reportId, responderId)
    return
  }

  const { error } = await supabase.rpc('assign_report', {
    p_report: reportId,
    p_responder: responderId,
    p_note: note ?? null,
  })
  if (error) throw error
}

export async function cancelAssignment(assignmentId: string, reason?: string): Promise<void> {
  if (DEMO_MODE) {
    const { demoCancelAssignment } = await import('./demo')
    demoCancelAssignment(assignmentId)
    return
  }

  const { error } = await supabase.rpc('cancel_assignment', {
    p_assignment: assignmentId,
    p_reason: reason ?? null,
  })
  if (error) throw error
}

export async function triageReport(
  reportId: string,
  priority?: Priority | null,
  status?: ReportStatus | null,
): Promise<void> {
  if (DEMO_MODE) {
    const { demoTriageReport } = await import('./demo')
    demoTriageReport(reportId, priority ?? null, status ?? null)
    return
  }

  const { error } = await supabase.rpc('triage_report', {
    p_report: reportId,
    p_priority: priority ?? null,
    p_status: status ?? null,
  })
  if (error) throw error
}
