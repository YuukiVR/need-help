import type {
  Priority,
  Profile,
  ReportEvent,
  ReportRow,
  ReportStatus,
  ReportType,
  ResponderOption,
  Role,
} from './types'
import { DEMO_ADMIN } from './flags'

/**
 * Dev-only demo data, loaded on demand so production builds never ship it.
 *
 * Set VITE_DEMO_MODE=true in .env.local to browse the admin console without a
 * Supabase project. See ./flags.ts for the switch.
 */

const NOW = Date.now()
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()

const people: Profile[] = [
  DEMO_ADMIN,
  {
    id: 'demo-admin-2',
    full_name: 'Priya Raman',
    phone: '+1 555 0101',
    email: 'priya@need-help.local',
    role: 'admin',
    zone: 'North',
    is_active: true,
    created_at: iso(60 * 24 * 90),
  },
  {
    id: 'demo-responder-1',
    full_name: 'Marcus Bell',
    phone: '+1 555 0110',
    email: 'marcus@need-help.local',
    role: 'responder',
    zone: 'North',
    is_active: true,
    created_at: iso(60 * 24 * 60),
  },
  {
    id: 'demo-responder-2',
    full_name: 'Aisha Kamara',
    phone: '+1 555 0111',
    email: 'aisha@need-help.local',
    role: 'responder',
    zone: 'Central',
    is_active: true,
    created_at: iso(60 * 24 * 45),
  },
  {
    id: 'demo-responder-3',
    full_name: 'Diego Santos',
    phone: '+1 555 0112',
    email: 'diego@need-help.local',
    role: 'responder',
    zone: 'South',
    is_active: false,
    created_at: iso(60 * 24 * 30),
  },
  {
    id: 'demo-consumer-1',
    full_name: 'Lena Fischer',
    phone: '+1 555 0120',
    email: 'lena@example.com',
    role: 'consumer',
    zone: 'North',
    is_active: true,
    created_at: iso(60 * 24 * 21),
  },
  {
    id: 'demo-consumer-2',
    full_name: 'Tomas Ortega',
    phone: '+1 555 0121',
    email: 'tomas@example.com',
    role: 'consumer',
    zone: 'Central',
    is_active: true,
    created_at: iso(60 * 24 * 14),
  },
  {
    id: 'demo-consumer-3',
    full_name: 'Nadia Haddad',
    phone: '+1 555 0122',
    email: 'nadia@example.com',
    role: 'consumer',
    zone: 'South',
    is_active: true,
    created_at: iso(60 * 24 * 9),
  },
  {
    id: 'demo-consumer-4',
    full_name: 'Sam Whitfield',
    phone: null,
    email: 'sam@example.com',
    role: 'consumer',
    zone: null,
    is_active: false,
    created_at: iso(60 * 24 * 3),
  },
]

const responders = people.filter((person) => person.role === 'responder')

interface Seed {
  ticket: number
  type: ReportType
  status: ReportStatus
  priority: Priority
  emergency?: boolean
  description: string
  address: string
  lat?: number
  lng?: number
  consumer: number
  age: number
  responder?: number
  resolvedAge?: number
}

const seeds: Seed[] = [
  {
    ticket: 1042,
    type: 'fire',
    status: 'new',
    priority: 'critical',
    emergency: true,
    description: 'Smoke coming from the transformer behind the market. Smells like burning plastic.',
    address: '14 Market Street, behind the produce hall',
    lat: 6.8013,
    lng: -58.1551,
    consumer: 0,
    age: 6,
  },
  {
    ticket: 1041,
    type: 'water',
    status: 'new',
    priority: 'high',
    description: 'No water since last night. Whole block is dry, neighbours confirmed too.',
    address: '8 Rosewood Avenue, Block C',
    lat: 6.8045,
    lng: -58.1498,
    consumer: 1,
    age: 42,
  },
  {
    ticket: 1040,
    type: 'electricity',
    status: 'triaged',
    priority: 'high',
    description: 'Power cuts on and off for two hours. Fridge is warming up.',
    address: '221 Kestrel Road',
    consumer: 2,
    age: 95,
  },
  {
    ticket: 1039,
    type: 'water',
    status: 'assigned',
    priority: 'medium',
    description: 'Burst pipe flooding the sidewalk in front of the school gate.',
    address: 'School Lane, near the east gate',
    lat: 6.7998,
    lng: -58.1602,
    consumer: 0,
    age: 160,
    responder: 0,
  },
  {
    ticket: 1038,
    type: 'electricity',
    status: 'in_progress',
    priority: 'critical',
    emergency: true,
    description: 'Downed cable across the driveway. Nobody is touching it.',
    address: '5 Almond Court',
    lat: 6.8071,
    lng: -58.1533,
    consumer: 1,
    age: 210,
    responder: 1,
  },
  {
    ticket: 1037,
    type: 'fire',
    status: 'assigned',
    priority: 'high',
    emergency: true,
    description: 'Kitchen fire reported by neighbour, family is outside.',
    address: '77 Bellflower Street, apartment 3B',
    consumer: 2,
    age: 260,
    responder: 0,
  },
  {
    ticket: 1036,
    type: 'water',
    status: 'resolved',
    priority: 'low',
    description: 'Dripping tap in the community centre washroom.',
    address: 'Community Centre, Hall 2',
    consumer: 1,
    age: 60 * 26,
    responder: 1,
    resolvedAge: 60 * 3,
  },
  {
    ticket: 1035,
    type: 'electricity',
    status: 'resolved',
    priority: 'medium',
    description: 'Street light out on the corner, very dark at night.',
    address: 'Corner of Palm and 3rd',
    consumer: 0,
    age: 60 * 30,
    responder: 0,
    resolvedAge: 60 * 5,
  },
  {
    ticket: 1034,
    type: 'water',
    status: 'in_progress',
    priority: 'medium',
    description: 'Low pressure on the top floor for three days.',
    address: '31 Juniper Heights, floor 5',
    consumer: 2,
    age: 60 * 8,
    responder: 1,
  },
  {
    ticket: 1033,
    type: 'fire',
    status: 'resolved',
    priority: 'critical',
    emergency: true,
    description: 'Small grass fire near the lot, put out by neighbours.',
    address: 'Empty lot, 9th Avenue',
    consumer: 1,
    age: 60 * 40,
    responder: 0,
    resolvedAge: 60 * 38,
  },
  {
    ticket: 1032,
    type: 'electricity',
    status: 'cancelled',
    priority: 'low',
    description: 'Reported outage, turned out to be a tripped breaker inside the house.',
    address: '12 Willow Bend',
    consumer: 0,
    age: 60 * 52,
  },
  {
    ticket: 1031,
    type: 'water',
    status: 'duplicate',
    priority: 'low',
    description: 'Same burst pipe as ticket 1039.',
    address: 'School Lane',
    consumer: 2,
    age: 60 * 60,
  },
  {
    ticket: 1030,
    type: 'electricity',
    status: 'resolved',
    priority: 'high',
    description: 'Meter box sparking after the storm.',
    address: '64 Cedar Walk',
    consumer: 1,
    age: 60 * 70,
    responder: 1,
    resolvedAge: 60 * 66,
  },
  {
    ticket: 1029,
    type: 'water',
    status: 'new',
    priority: 'medium',
    description: 'Water tastes metallic since yesterday morning.',
    address: '2 Orchard Terrace',
    consumer: 2,
    age: 60 * 18,
  },
  {
    ticket: 1028,
    type: 'electricity',
    status: 'triaged',
    priority: 'low',
    description: 'Flickering lights in the hallway, no outage yet.',
    address: '18 Larkspur House',
    consumer: 0,
    age: 60 * 33,
  },
  {
    ticket: 1027,
    type: 'water',
    status: 'resolved',
    priority: 'medium',
    description: 'Sewage smell from the drain outside the bakery.',
    address: '9 Baker Street',
    consumer: 1,
    age: 60 * 80,
    responder: 0,
    resolvedAge: 60 * 74,
  },
]

function buildReport(seed: Seed): ReportRow {
  const consumer = people.filter((person) => person.role === 'consumer')[seed.consumer]
  const responder = seed.responder != null ? responders[seed.responder] : undefined
  const assigned = Boolean(responder)
  const assignmentStatus =
    seed.status === 'resolved'
      ? 'completed'
      : seed.status === 'in_progress'
        ? 'in_progress'
        : assigned
          ? 'accepted'
          : null

  return {
    id: `demo-report-${seed.ticket}`,
    ticket_no: seed.ticket,
    type: seed.type,
    status: seed.status,
    priority: seed.priority,
    is_emergency: Boolean(seed.emergency),
    description: seed.description,
    photo_path: null,
    address_text: seed.address,
    lat: seed.lat ?? null,
    lng: seed.lng ?? null,
    created_at: iso(seed.age),
    updated_at: iso(Math.max(1, seed.age - 5)),
    resolved_at: seed.resolvedAge != null ? iso(seed.resolvedAge) : null,
    reporter_id: consumer.id,
    reporter_name: consumer.full_name,
    reporter_phone: consumer.phone,
    assignment_id: responder ? `demo-assignment-${seed.ticket}` : null,
    assignment_status: assignmentStatus,
    responder_id: responder?.id ?? null,
    responder_name: responder?.full_name ?? null,
    responder_phone: responder?.phone ?? null,
    age_minutes: seed.age,
  }
}

const reports: ReportRow[] = seeds.map(buildReport)

const events = new Map<string, ReportEvent[]>()
for (const report of reports) {
  const timeline: ReportEvent[] = [
    {
      id: report.ticket_no * 10,
      report_id: report.id,
      author_id: report.reporter_id,
      kind: 'system',
      message: 'Report submitted.',
      photo_path: null,
      created_at: report.created_at,
    },
  ]

  if (report.status !== 'new') {
    timeline.push({
      id: report.ticket_no * 10 + 1,
      report_id: report.id,
      author_id: DEMO_ADMIN.id,
      kind: 'status',
      message: `Triaged as ${report.priority} priority.`,
      photo_path: null,
      created_at: iso(Math.max(1, (report.age_minutes ?? 0) - 10)),
    })
  }

  if (report.responder_id) {
    timeline.push({
      id: report.ticket_no * 10 + 2,
      report_id: report.id,
      author_id: DEMO_ADMIN.id,
      kind: 'assignment',
      message: `Assigned to ${report.responder_name}.`,
      photo_path: null,
      created_at: iso(Math.max(1, (report.age_minutes ?? 0) - 15)),
    })
  }

  if (report.resolved_at) {
    timeline.push({
      id: report.ticket_no * 10 + 3,
      report_id: report.id,
      author_id: report.responder_id,
      kind: 'status',
      message: 'Marked as resolved.',
      photo_path: null,
      created_at: report.resolved_at,
    })
  }

  events.set(report.id, timeline)
}

const authorNames = new Map(people.map((person) => [person.id, person.full_name]))

export function demoFetchDashboard() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayIso = startOfToday.toISOString()

  const open = reports.filter((report) =>
    ['new', 'triaged', 'assigned'].includes(report.status),
  ).length
  const inProgress = reports.filter((report) => report.status === 'in_progress').length
  const emergency = reports.filter(
    (report) =>
      report.is_emergency &&
      ['new', 'triaged', 'assigned', 'in_progress'].includes(report.status),
  ).length
  const resolvedToday = reports.filter(
    (report) => report.resolved_at && report.resolved_at >= todayIso,
  ).length

  const recent = [...reports].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  const priorityRank: Record<Priority, number> = { critical: 4, high: 3, medium: 2, low: 1 }
  const attention = reports
    .filter((report) => report.status === 'new' || report.status === 'triaged')
    .sort(
      (a, b) =>
        Number(b.is_emergency) - Number(a.is_emergency) ||
        priorityRank[b.priority] - priorityRank[a.priority] ||
        a.created_at.localeCompare(b.created_at),
    )
    .slice(0, 5)

  return {
    open,
    inProgress,
    emergency,
    resolvedToday,
    total: reports.length,
    responders: people.filter((person) => person.role === 'responder' && person.is_active).length,
    consumers: people.filter((person) => person.role === 'consumer' && person.is_active).length,
    byType: {
      water: reports.filter((report) => report.type === 'water').length,
      electricity: reports.filter((report) => report.type === 'electricity').length,
      fire: reports.filter((report) => report.type === 'fire').length,
    },
    recent,
    attention,
  }
}

export function demoFetchReports(filters: {
  status: ReportStatus | 'all'
  type: ReportType | 'all'
  priority: Priority | 'all'
  search: string
  page: number
  pageSize: number
}) {
  const search = filters.search.trim().toLowerCase()

  const filtered = reports
    .filter((report) => filters.status === 'all' || report.status === filters.status)
    .filter((report) => filters.type === 'all' || report.type === filters.type)
    .filter((report) => filters.priority === 'all' || report.priority === filters.priority)
    .filter((report) => {
      if (!search) return true
      return (
        String(report.ticket_no).includes(search) ||
        (report.description ?? '').toLowerCase().includes(search) ||
        (report.address_text ?? '').toLowerCase().includes(search) ||
        (report.reporter_name ?? '').toLowerCase().includes(search)
      )
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const from = (filters.page - 1) * filters.pageSize
  return {
    rows: filtered.slice(from, from + filters.pageSize),
    total: filtered.length,
  }
}

export function demoFetchUsers(params: {
  search: string
  role: Role | 'all'
  page: number
  pageSize: number
}) {
  const search = params.search.trim().toLowerCase()

  const filtered = people
    .filter((person) => params.role === 'all' || person.role === params.role)
    .filter((person) => {
      if (!search) return true
      return (
        person.full_name.toLowerCase().includes(search) ||
        (person.email ?? '').toLowerCase().includes(search) ||
        (person.phone ?? '').toLowerCase().includes(search)
      )
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const from = (params.page - 1) * params.pageSize
  return {
    rows: filtered.slice(from, from + params.pageSize),
    total: filtered.length,
  }
}

export function demoFetchReportDetail(reportId: string) {
  const report = reports.find((item) => item.id === reportId)
  if (!report) throw new Error('Report not found.')

  return {
    report,
    events: (events.get(reportId) ?? []).map((event) => ({
      ...event,
      author_name: event.author_id ? authorNames.get(event.author_id) ?? null : null,
    })),
    responders: responders
      .filter((person) => person.is_active)
      .map<ResponderOption>((person) => ({
        id: person.id,
        full_name: person.full_name,
        phone: person.phone,
        zone: person.zone,
      })),
    photoUrl: null,
  }
}

export function demoAssignReport(reportId: string, responderId: string) {
  const report = reports.find((item) => item.id === reportId)
  const responder = responders.find((person) => person.id === responderId)
  if (!report || !responder) return

  report.assignment_id = `demo-assignment-${report.ticket_no}`
  report.assignment_status = 'assigned'
  report.responder_id = responder.id
  report.responder_name = responder.full_name
  report.responder_phone = responder.phone
  if (report.status === 'new' || report.status === 'triaged') report.status = 'assigned'
  report.updated_at = new Date().toISOString()

  events.get(reportId)?.push({
    id: Date.now(),
    report_id: reportId,
    author_id: DEMO_ADMIN.id,
    kind: 'assignment',
    message: `Assigned to ${responder.full_name}.`,
    photo_path: null,
    created_at: report.updated_at,
  })
}

export function demoCancelAssignment(assignmentId: string) {
  const report = reports.find((item) => item.assignment_id === assignmentId)
  if (!report) return

  report.assignment_id = null
  report.assignment_status = null
  report.responder_id = null
  report.responder_name = null
  report.responder_phone = null
  if (report.status === 'assigned') report.status = 'triaged'
  report.updated_at = new Date().toISOString()

  events.get(report.id)?.push({
    id: Date.now(),
    report_id: report.id,
    author_id: DEMO_ADMIN.id,
    kind: 'assignment',
    message: 'Assignment cancelled.',
    photo_path: null,
    created_at: report.updated_at,
  })
}

export function demoTriageReport(
  reportId: string,
  priority: Priority | null,
  status: ReportStatus | null,
) {
  const report = reports.find((item) => item.id === reportId)
  if (!report) return

  if (priority) report.priority = priority
  if (status) report.status = status
  report.updated_at = new Date().toISOString()
  if (status === 'resolved') report.resolved_at = report.updated_at

  events.get(reportId)?.push({
    id: Date.now(),
    report_id: reportId,
    author_id: DEMO_ADMIN.id,
    kind: 'status',
    message: `Set to ${(status ?? report.status).replace('_', ' ')} (${priority ?? report.priority}).`,
    photo_path: null,
    created_at: report.updated_at,
  })
}

export function demoUpdateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'role' | 'is_active' | 'zone' | 'phone'>>,
) {
  const person = people.find((item) => item.id === id)
  if (person) Object.assign(person, patch)
}
