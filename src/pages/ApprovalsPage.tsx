import type { ServerState } from '../api'
import { taskKey } from '../taskStore'
import type { Approval } from '../types'

type Props = {
  data: ServerState
  onOpenTask: (id: string) => void
  onDecide: (approvalId: string, decision: 'approved' | 'rejected') => void
}

const STATUS_TEXT: Record<Approval['status'], string> = { pending: '대기', approved: '승인', rejected: '거절' }
const SOURCE_TEXT: Record<Approval['source'], string> = { heartbeat: '하트비트', routine: '반복 업무' }

export function ApprovalsPage({ data, onOpenTask, onDecide }: Props) {
  const pending = data.approvals.filter((a) => a.status === 'pending')
  const history = data.approvals.filter((a) => a.status !== 'pending').slice(0, 50)

  const row = (a: Approval) => {
    const task = data.tasks.find((t) => t.id === a.taskId)
    const agent = data.agents.find((x) => x.id === a.agentId)
    return (
      <li key={a.id} className="inbox-row">
        <button className="row-link" onClick={() => task && onOpenTask(task.id)}>
          <span className={`badge approval-${a.status}`}>{STATUS_TEXT[a.status]}</span>
          <span className="row-link-title">
            {task ? `${taskKey(task)} ${task.title}` : '삭제된 작업'}
            <span className="muted">
              {' '}
              · {agent?.name ?? '삭제된 에이전트'} · {SOURCE_TEXT[a.source]} · {a.reason}
            </span>
          </span>
          <span className="muted">{new Date(a.decidedAt ?? a.requestedAt).toLocaleString('ko-KR')}</span>
        </button>
        {a.status === 'pending' && (
          <div className="inbox-actions">
            <button onClick={() => onDecide(a.id, 'rejected')}>거절</button>
            <button className="primary" onClick={() => onDecide(a.id, 'approved')}>
              승인하고 실행
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <main className="page">
      <p className="muted page-intro">
        자동 실행(하트비트, 반복 업무) 전에 승인을 받도록 설정한 에이전트의 요청이 여기에 옵니다. 거절한 작업은 다시
        고치기 전까지 자동으로 실행되지 않습니다.
      </p>
      <section className="card">
        <header className="card-header">
          <h2>대기 중</h2>
          <span className="muted">{pending.length}건</span>
        </header>
        <ul className="row-list">
          {pending.map(row)}
          {pending.length === 0 && <li className="empty">기다리는 승인 요청이 없습니다.</li>}
        </ul>
      </section>
      <section className="card">
        <header className="card-header">
          <h2>처리한 요청</h2>
          <span className="muted">최근 50건</span>
        </header>
        <ul className="row-list">
          {history.map(row)}
          {history.length === 0 && <li className="empty">아직 처리한 요청이 없습니다.</li>}
        </ul>
      </section>
    </main>
  )
}
