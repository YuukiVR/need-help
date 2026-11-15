import type { ReactNode } from 'react'
import { Droplets, Flame, Zap } from 'lucide-react'
import type { Priority, ReportStatus, ReportType } from '../lib/types'

export function Pill({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  )
}

const STATUS: Record<ReportStatus, { label: string; className: string; dot: string }> = {
  new: {
    label: 'New',
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
    dot: 'bg-blue-500',
  },
  triaged: {
    label: 'Triaged',
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    dot: 'bg-indigo-500',
  },
  assigned: {
    label: 'Assigned',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-violet-50 text-violet-700 ring-violet-200',
    dot: 'bg-violet-500',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  },
  duplicate: {
    label: 'Duplicate',
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  },
}

const PRIORITY: Record<Priority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  medium: { label: 'Medium', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  high: { label: 'High', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  critical: { label: 'Critical', className: 'bg-red-50 text-red-700 ring-red-200' },
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const item = STATUS[status] ?? STATUS.new
  return (
    <Pill className={item.className}>
      <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
      {item.label}
    </Pill>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const item = PRIORITY[priority] ?? PRIORITY.medium
  return <Pill className={item.className}>{item.label}</Pill>
}

const TYPE: Record<
  ReportType,
  { label: string; className: string; Icon: typeof Droplets }
> = {
  water: {
    label: 'Water',
    className: 'bg-sky-50 text-sky-700 ring-sky-200',
    Icon: Droplets,
  },
  electricity: {
    label: 'Electricity',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    Icon: Zap,
  },
  fire: {
    label: 'Fire',
    className: 'bg-red-50 text-red-700 ring-red-200',
    Icon: Flame,
  },
}

export function TypeBadge({ type }: { type: ReportType }) {
  const item = TYPE[type] ?? TYPE.water
  const Icon = item.Icon
  return (
    <Pill className={item.className}>
      <Icon className="h-3 w-3" />
      {item.label}
    </Pill>
  )
}

export const TYPE_META = TYPE
