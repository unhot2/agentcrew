import { IconAlertTriangle } from '@tabler/icons-react'
import { initials, STATUS_LABEL as AGENT_STATUS_LABEL } from '../components/AgentList'
import { RUN_STATUS_TEXT } from '../components/RunLog'
import { PROJECT_STATUS_LABEL } from '../projectStore'
import { STATUS_LABEL, STATUS_ORDER, taskKey } from '../taskStore'
import type { Agent, Project, Task, TaskRun } from '../types'

type Props = {
  agents: Agent[]
  tasks: Task[]
  projects: Project[]
  pendingApprovals: number
  onOpenTask: (id: string) => void
  onOpenAgent: (id: string) => void
  onOpenProject: (id: string) => void
  onAddAgent: () => void
}

const DAYS = 14

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.round(min / 60)}시간 전`
  return `${Math.round(min / 60 / 24)}일 전`
}

export function DashboardPage({ agents, tasks, projects, pendingApprovals, onOpenTask, onOpenAgent, onOpenProject, onAddAgent }: Props) {
  const runs: { task: Task; run: TaskRun }[] = tasks.flatMap((task) => task.runs.map((run) => ({ task, run })))
  const activeAgents = agents.filter((a) => a.status !== 'paused')
  const monthSpend = agents.reduce((s, a) => s + a.spentThisMonth, 0)
  const monthBudget = agents.reduce((s, a) => s + a.monthlyBudget, 0)
  const count = (status: Task['status']) => tasks.filter((t) => t.status === status).length

  // 최근 14일 실행 수 (오늘 포함)
  const today = new Date()
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (DAYS - 1 - i))
    const key = dayKey(d)
    const dayRuns = runs.filter(({ run }) => dayKey(new Date(run.startedAt)) === key)
    return {
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      completed: dayRuns.filter(({ run }) => run.status === 'completed').length,
      failed: dayRuns.filter(({ run }) => run.status === 'failed').length,
      stopped: dayRuns.filter(({ run }) => run.status === 'stopped').length,
      running: dayRuns.filter(({ run }) => run.status === 'running').length,
    }
  })
  const maxDay = Math.max(1, ...days.map((d) => d.completed + d.failed + d.stopped + d.running))
  const finished = runs.filter(({ run }) => run.status !== 'running')
  const successRate = finished.length
    ? Math.round((finished.filter(({ run }) => run.status === 'completed').length / finished.length) * 100)
    : null

  const maxStatus = Math.max(1, ...STATUS_ORDER.map(count))
  const recentRuns = [...runs].sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt)).slice(0, 8)
  const recentTasks = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? '담당 없음'

  return (
    <main className="page dashboard">
      {agents.length === 0 && (
        <div className="notice">
          <IconAlertTriangle size={16} aria-hidden />
          <span>아직 에이전트가 없습니다. 에이전트를 만들어야 작업을 맡길 수 있습니다.</span>
          <button onClick={onAddAgent}>에이전트 추가</button>
        </div>
      )}
      {agents.length > 0 && activeAgents.length === 0 && (
        <div className="notice">
          <IconAlertTriangle size={16} aria-hidden />
          <span>모든 에이전트가 일시 정지 상태라 아무 작업도 실행되지 않습니다.</span>
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <span className="metric-label">활성 에이전트</span>
          <span className="metric-value">
            {activeAgents.length}
            <span className="metric-sub"> / {agents.length}</span>
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">진행 중인 작업</span>
          <span className="metric-value">{count('in_progress')}</span>
        </div>
        <div className="metric">
          <span className="metric-label">검토 대기</span>
          <span className="metric-value">{count('in_review')}</span>
        </div>
        <div className="metric">
          <span className="metric-label">승인 대기</span>
          <span className="metric-value">{pendingApprovals}</span>
        </div>
        <div className="metric">
          <span className="metric-label">이번 달 사용액</span>
          <span className="metric-value">
            ${monthSpend.toFixed(2)}
            {monthBudget > 0 && <span className="metric-sub"> / ${monthBudget.toFixed(0)}</span>}
          </span>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card">
          <header className="card-header">
            <h2>실행 기록</h2>
            <span className="muted">최근 14일{successRate !== null && ` · 성공률 ${successRate}%`}</span>
          </header>
          <div className="legend chart-legend">
            <span>
              <span className="swatch run-completed" /> 완료
            </span>
            <span>
              <span className="swatch run-failed" /> 실패·중지
            </span>
          </div>
          <div className="columns" role="img" aria-label="최근 14일 일별 실행 수">
            {days.map((d) => {
              const ok = d.completed + d.running
              const bad = d.failed + d.stopped
              return (
                <div key={d.label} className="column">
                  <div className="column-tip" role="tooltip">
                    <strong>{d.label}</strong>
                    <span>완료 {d.completed}</span>
                    <span>실패 {d.failed}</span>
                    <span>중지 {d.stopped}</span>
                    {d.running > 0 && <span>실행 중 {d.running}</span>}
                  </div>
                  <div className="column-stack">
                    {bad > 0 && <div className="seg run-failed" style={{ height: `${(bad / maxDay) * 100}%` }} />}
                    {ok > 0 && <div className="seg run-completed" style={{ height: `${(ok / maxDay) * 100}%` }} />}
                  </div>
                  <span className="column-label">{d.label.split('/')[1]}</span>
                </div>
              )
            })}
          </div>
          <details className="table-view">
            <summary>표로 보기</summary>
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>완료</th>
                  <th>실패</th>
                  <th>중지</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label}</td>
                    <td>{d.completed}</td>
                    <td>{d.failed}</td>
                    <td>{d.stopped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>작업 상태</h2>
            <span className="muted">전체 {tasks.length}개</span>
          </header>
          <div className="hbars">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="hbar">
                <span className="hbar-label">{STATUS_LABEL[s]}</span>
                <span className="hbar-track">
                  {count(s) > 0 && <span className="hbar-fill" style={{ width: `${(count(s) / maxStatus) * 100}%` }} />}
                </span>
                <span className="hbar-value">{count(s)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>에이전트</h2>
            <span className="muted">이번 달 예산 사용</span>
          </header>
          <ul className="row-list">
            {agents.map((a) => {
              const pct = a.monthlyBudget > 0 ? Math.min(100, (a.spentThisMonth / a.monthlyBudget) * 100) : 0
              return (
                <li key={a.id}>
                  <button className="row-link" onClick={() => onOpenAgent(a.id)}>
                    <span className={`avatar adapter-${a.adapter.type}`}>{initials(a.name)}</span>
                    <span className="row-link-title">{a.name}</span>
                    <span className={`badge status-${a.status}`}>{AGENT_STATUS_LABEL[a.status]}</span>
                    <span className="mini-bar" title={`$${a.spentThisMonth.toFixed(2)} / $${a.monthlyBudget}`}>
                      <span className={`bar-fill${pct >= 100 ? ' over' : ''}`} style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                </li>
              )
            })}
            {agents.length === 0 && <li className="empty">에이전트가 없습니다.</li>}
          </ul>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>프로젝트</h2>
            <span className="muted">완료한 작업 비율</span>
          </header>
          <ul className="row-list">
            {projects.map((p) => {
              const own = tasks.filter((t) => t.projectId === p.id)
              const done = own.filter((t) => t.status === 'done').length
              const pct = own.length ? (done / own.length) * 100 : 0
              return (
                <li key={p.id}>
                  <button className="row-link" onClick={() => onOpenProject(p.id)}>
                    <span className="project-swatch" style={{ background: p.color }} />
                    <span className="row-link-title">{p.name || '이름 없는 프로젝트'}</span>
                    <span className="muted">{PROJECT_STATUS_LABEL[p.status]}</span>
                    <span className="mini-bar">
                      <span className="bar-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="muted num">
                      {done}/{own.length}
                    </span>
                  </button>
                </li>
              )
            })}
            {projects.length === 0 && <li className="empty">프로젝트가 없습니다.</li>}
          </ul>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>최근 활동</h2>
          </header>
          <ul className="row-list">
            {recentRuns.map(({ task, run }) => (
              <li key={run.id}>
                <button className="row-link" onClick={() => onOpenTask(task.id)}>
                  <span className={`run-status run-${run.status}`}>{RUN_STATUS_TEXT[run.status]}</span>
                  <span className="row-link-title">
                    {agentName(run.agentId)} · {taskKey(task)} {task.title}
                  </span>
                  <span className="muted">{timeAgo(run.startedAt)}</span>
                </button>
              </li>
            ))}
            {recentRuns.length === 0 && <li className="empty">아직 실행 기록이 없습니다.</li>}
          </ul>
        </section>

        <section className="card">
          <header className="card-header">
            <h2>최근 작업</h2>
          </header>
          <ul className="row-list">
            {recentTasks.map((t) => (
              <li key={t.id}>
                <button className="row-link" onClick={() => onOpenTask(t.id)}>
                  <span className="task-key">{taskKey(t)}</span>
                  <span className="row-link-title">{t.title || '제목 없음'}</span>
                  <span className={`task-status status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  <span className="muted">{timeAgo(t.updatedAt)}</span>
                </button>
              </li>
            ))}
            {recentTasks.length === 0 && <li className="empty">아직 작업이 없습니다.</li>}
          </ul>
        </section>
      </div>
    </main>
  )
}
