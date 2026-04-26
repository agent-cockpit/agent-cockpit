import { useEffect, useState } from 'react'
import { DAEMON_URL } from '../lib/daemonUrl.js'

interface UsageStats {
  sessions: {
    total: number
    active: number
    ended: number
    byProvider: Record<string, number>
  }
  tokens: {
    totalInput: number
    totalOutput: number
    totalCached: number
    totalAll: number
    byModel: Record<string, { input: number; output: number; cached: number }>
  }
  activity: {
    totalToolCalls: number
    totalFileChanges: number
    totalApprovals: number
    approvedCount: number
    deniedCount: number
    totalSubagentSpawns: number
    mostUsedTools: Array<{ toolName: string; count: number }>
  }
  sessionsOverTime: Array<{ date: string; count: number }>
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div
      className="cockpit-frame-full relative rounded border border-border bg-[var(--color-panel-surface)] p-4 flex flex-col gap-1"
    >
      <span className="cockpit-corner cockpit-corner-tl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-tr" aria-hidden />
      <span className="cockpit-corner cockpit-corner-bl" aria-hidden />
      <span className="cockpit-corner cockpit-corner-br" aria-hidden />
      <p className="cockpit-label text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className="font-mono text-2xl font-semibold tabular-nums"
        style={{ color: color ?? 'var(--color-cockpit-cyan)' }}
      >
        {typeof value === 'number' ? fmt(value) : value}
      </p>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="cockpit-label text-[11px] uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0">
      {title}
    </h2>
  )
}

export function StatsPage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${DAEMON_URL}/api/stats`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<UsageStats>
      })
      .then(setStats)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-cockpit-red)] font-mono text-sm">
        Failed to load stats: {error}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground font-mono text-sm">
        Loading...
      </div>
    )
  }

  const sessionsOverTime = (() => {
    const byDate = new Map(stats.sessionsOverTime.map((d) => [d.date, d.count]))
    const days: Array<{ date: string; count: number }> = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      days.push({ date: iso, count: byDate.get(iso) ?? 0 })
    }
    return days
  })()

  const maxDailyCount = Math.max(...sessionsOverTime.map((d) => d.count), 1)
  const maxToolCount = Math.max(...stats.activity.mostUsedTools.map((t) => t.count), 1)
  const modelEntries = Object.entries(stats.tokens.byModel)

  return (
    <div className="h-full overflow-y-auto p-6 [font-family:var(--font-sidebar-body)]">
      <div className="max-w-5xl mx-auto">

        {/* Sessions */}
        <SectionHeader title="Sessions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.sessions.total} />
          <StatCard label="Active" value={stats.sessions.active} color="var(--color-cockpit-green)" />
          <StatCard label="Ended" value={stats.sessions.ended} color="var(--color-cockpit-dim)" />
          {Object.entries(stats.sessions.byProvider).map(([provider, count]) => (
            <StatCard
              key={provider}
              label={provider.charAt(0).toUpperCase() + provider.slice(1)}
              value={count}
              color={
                provider === 'claude'
                  ? 'var(--color-provider-claude)'
                  : provider === 'codex'
                  ? 'var(--color-provider-codex)'
                  : undefined
              }
            />
          ))}
        </div>

        {/* Tokens */}
        <SectionHeader title="Token Usage" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Tokens" value={stats.tokens.totalAll} />
          <StatCard label="Input" value={stats.tokens.totalInput} color="var(--color-cockpit-cyan)" />
          <StatCard label="Output" value={stats.tokens.totalOutput} color="var(--color-cockpit-amber)" />
          <StatCard label="Cached" value={stats.tokens.totalCached} color="var(--color-cockpit-green)" />
        </div>

        {modelEntries.length > 0 && (
          <div className="mt-3 rounded border border-border bg-[var(--color-panel-surface)] overflow-hidden">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-2 font-normal uppercase tracking-widest">Model</th>
                  <th className="text-right px-4 py-2 font-normal uppercase tracking-widest">Input</th>
                  <th className="text-right px-4 py-2 font-normal uppercase tracking-widest">Output</th>
                  <th className="text-right px-4 py-2 font-normal uppercase tracking-widest">Cached</th>
                </tr>
              </thead>
              <tbody>
                {modelEntries.map(([model, t]) => (
                  <tr key={model} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 text-foreground">{model}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-cockpit-cyan)' }}>{fmt(t.input)}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-cockpit-amber)' }}>{fmt(t.output)}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-cockpit-green)' }}>{fmt(t.cached)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Activity */}
        <SectionHeader title="Activity" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Tool Calls" value={stats.activity.totalToolCalls} />
          <StatCard label="File Changes" value={stats.activity.totalFileChanges} color="var(--color-cockpit-amber)" />
          <StatCard label="Approvals" value={stats.activity.totalApprovals} color="var(--color-cockpit-amber)" />
          <StatCard label="Approved" value={stats.activity.approvedCount} color="var(--color-cockpit-green)" />
          <StatCard label="Denied" value={stats.activity.deniedCount} color="var(--color-cockpit-red)" />
          <StatCard label="Subagents" value={stats.activity.totalSubagentSpawns} color="var(--color-cockpit-cyan)" />
        </div>

        {/* Sessions over time */}
        {sessionsOverTime.length > 0 && (
          <>
            <SectionHeader title="Sessions — Last 30 Days" />
            <div className="rounded border border-border bg-[var(--color-panel-surface)] p-4">
              <div className="flex items-end gap-1 h-24">
                {sessionsOverTime.map((d) => (
                  <div
                    key={d.date}
                    className="group relative flex-1 h-full flex flex-col items-center justify-end"
                    title={`${d.date}: ${d.count}`}
                  >
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${(d.count / maxDailyCount) * 100}%`,
                        minHeight: '2px',
                        backgroundColor: 'var(--color-cockpit-cyan)',
                        opacity: 0.75,
                      }}
                    />
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                      {d.date.slice(5)} · {d.count}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-7 text-[9px] font-mono text-muted-foreground">
                <span>{sessionsOverTime[0]?.date?.slice(5)}</span>
                <span>{sessionsOverTime[sessionsOverTime.length - 1]?.date?.slice(5)}</span>
              </div>
            </div>
          </>
        )}

        {/* Top tools */}
        {stats.activity.mostUsedTools.length > 0 && (
          <>
            <SectionHeader title="Top Tools" />
            <div className="rounded border border-border bg-[var(--color-panel-surface)] p-4 space-y-2">
              {stats.activity.mostUsedTools.map((t) => (
                <div key={t.toolName} className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-foreground w-36 shrink-0 truncate">{t.toolName}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(t.count / maxToolCount) * 100}%`,
                        backgroundColor: 'var(--color-cockpit-cyan)',
                      }}
                    />
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-12 text-right shrink-0">
                    {fmt(t.count)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
