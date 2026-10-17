import { IconAlertTriangle, IconCheck, IconCoin, IconEye, IconShieldCheck } from '@tabler/icons-react'
import type { ServerState } from '../api'
import { taskKey } from '../taskStore'
import type { Task, TaskStatus } from '../types'

type Props = {
  data: ServerState
  onOpenTask: (id: string) => void
  onOpenAgent: (id: string) => void
  onSetTaskStatus: (id: string, status: TaskStatus) => void
  onRunTask: (task: Task) => void
  onDecide: (approvalId: string, decision: 'approved' | 'rejected') => void
}

/** 사람이 확인해야 할 것들. 처리하면 목록에서 사라진다 */
export function inboxItems(data: ServerState) {
  const approvals = data.approvals.filter((a) => a.status === 'pending')
  const reviews = data.tasks.filter((t) => t.status === 'in_review')
  const failures = data.tasks.filter((t) => {
    const last = t.runs[t.runs.length - 1]
    return last?.status === 'failed' && t.status !== 'done' && t.status !== 'cancelled'
  })
  const overBudget = data.agents.filter((a) => a.monthlyBudget > 0 && a.spentThisMonth >= a.monthlyBudget)
  return { approvals, reviews, failures, overBudget, count: approvals.length + reviews.length + failures.length + overBudget.length }
}

function lastError(task: Task) {
  const events = task.runs[task.runs.length - 1]?.events ?? []
  const e = [...events].reverse().find((x) => x.kind === 'error' || (x.kind === 'result' && x.isError))
  return e && 'text' in e ? e.text : '실행이 실패했습니다.'
}

export function InboxPage({ data, onOpenTask, onOpenAgent, onSetTaskStatus, onRunTask, onDecide }: Props) {
  const { approvals, reviews, failures, overBudget, count } = inboxItems(data)
  const task = (id: string) => data.tasks.find((t) => t.id === id)
  const agentName = (id: string | null) => data.agents.find((a) => a.id === id)?.name ?? '알 수 없음'

  if (count === 0) {
    return (
      <main className="page">
        <div className="empty-state">
          <h1>확인할 것이 없습니다</h1>
          <p className="muted">승인 요청, 검토할 작업, 실패한 실행, 예산을 다 쓴 에이전트가 생기면 여기에 모입니다.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page inbox">
      {approvals.length > 0 && (
        <section className="card">
          <header className="card-header">
            <h2>
              <IconShieldCheck size={16} aria-hidden /> 승인 요청
            </h2>
            <span className="muted">{approvals.length}건</span>
          </header>
          <ul className="row-list">
            {approvals.map((a) => {
              const t = task(a.taskId)
              return (
                <li key={a.id} className="inbox-row">
                  <button className="row-link" onClick={() => t && onOpenTask(t.id)}>
                    <span className="task-key">{t ? taskKey(t) : '-'}</span>
                    <span className="row-link-title">
                      {agentName(a.agentId)} · {t?.title ?? '삭제된 작업'}
                      <span className="muted"> · {a.reason}</span>
                    </span>
                  </button>
                  <div className="inbox-actions">
                    <button onClick={() => onDecide(a.id, 'rejected')}>거절</button>
                    <button className="primary" onClick={() => onDecide(a.id, 'approved')}>
                      {a.source === 'agent' ? '승인하고 진행' : '승인하고 실행'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="card">
          <header className="card-header">
            <h2>
              <IconEye size={16} aria-hidden /> 검토 대기
            </h2>
            <span className="muted">{reviews.length}건</span>
          </header>
          <ul className="row-list">
            {reviews.map((t) => (
              <li key={t.id} className="inbox-row">
                <button className="row-link" onClick={() => onOpenTask(t.id)}>
                  <span className="task-key">{taskKey(t)}</span>
                  <span className="row-link-title">
                    {t.title}
                    <span className="muted"> · {agentName(t.assigneeId)}</span>
                  </span>
                </button>
                <div className="inbox-actions">
                  <button onClick={() => onSetTaskStatus(t.id, 'todo')}>다시 할 일로</button>
                  <button className="primary" onClick={() => onSetTaskStatus(t.id, 'done')}>
                    <IconCheck size={14} aria-hidden /> 완료
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {failures.length > 0 && (
        <section className="card">
          <header className="card-header">
            <h2>
              <IconAlertTriangle size={16} aria-hidden /> 실패한 실행
            </h2>
            <span className="muted">{failures.length}건</span>
          </header>
          <ul className="row-list">
            {failures.map((t) => (
              <li key={t.id} className="inbox-row">
                <button className="row-link" onClick={() => onOpenTask(t.id)}>
                  <span className="task-key">{taskKey(t)}</span>
                  <span className="row-link-title">
                    {t.title}
                    <span className="error-text"> · {lastError(t)}</span>
                  </span>
                </button>
                <div className="inbox-actions">
                  <button onClick={() => onSetTaskStatus(t.id, 'cancelled')}>취소 처리</button>
                  <button className="primary" onClick={() => onRunTask(t)}>
                    다시 실행
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overBudget.length > 0 && (
        <section className="card">
          <header className="card-header">
            <h2>
              <IconCoin size={16} aria-hidden /> 예산을 다 쓴 에이전트
            </h2>
            <span className="muted">{overBudget.length}명</span>
          </header>
          <ul className="row-list">
            {overBudget.map((a) => (
              <li key={a.id}>
                <button className="row-link" onClick={() => onOpenAgent(a.id)}>
                  <span className="row-link-title">{a.name}</span>
                  <span className="muted">
                    ${a.spentThisMonth.toFixed(2)} / ${a.monthlyBudget}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
