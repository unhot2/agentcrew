import { useState } from 'react'
import type { ServerState } from '../api'
import { taskKey } from '../taskStore'
import type { Approval } from '../types'

type Props = {
  data: ServerState
  onOpenTask: (id: string) => void
  onDecide: (approvalId: string, decision: 'approved' | 'rejected', comment?: string) => void
}

const STATUS_TEXT: Record<Approval['status'], string> = { pending: '대기', approved: '승인', rejected: '거절' }
const SOURCE_TEXT: Record<Approval['source'], string> = { heartbeat: '하트비트', routine: '반복 업무', agent: '에이전트 요청' }

export function ApprovalsPage({ data, onOpenTask, onDecide }: Props) {
  const pending = data.approvals.filter((a) => a.status === 'pending')
  const history = data.approvals.filter((a) => a.status !== 'pending').slice(0, 50)
  // 승인 요청마다 적고 있는 코멘트
  const [comments, setComments] = useState<Record<string, string>>({})

  const decide = (a: Approval, decision: 'approved' | 'rejected') => {
    onDecide(a.id, decision, comments[a.id] ?? '')
    setComments(({ [a.id]: _done, ...rest }) => rest)
  }

  const row = (a: Approval) => {
    const task = data.tasks.find((t) => t.id === a.taskId)
    const agent = data.agents.find((x) => x.id === a.agentId)
    const fromAgent = a.source === 'agent'
    const comment = comments[a.id] ?? ''
    return (
      <li key={a.id} className="approval-item">
        <div className="inbox-row">
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
          {a.status === 'pending' && !fromAgent && (
            <div className="inbox-actions">
              <button onClick={() => decide(a, 'rejected')}>거절</button>
              <button className="primary" onClick={() => decide(a, 'approved')}>
                승인하고 실행
              </button>
            </div>
          )}
        </div>
        {fromAgent && a.details && <p className="approval-details">{a.details}</p>}
        {a.status !== 'pending' && a.comment && <p className="approval-comment">코멘트: {a.comment}</p>}
        {a.status === 'pending' && fromAgent && (
          <div className="approval-decide">
            <textarea
              rows={2}
              value={comment}
              placeholder="코멘트 (선택). 에이전트에게 그대로 전달됩니다."
              aria-label="코멘트"
              onChange={(e) => setComments((c) => ({ ...c, [a.id]: e.target.value }))}
            />
            <div className="approval-decide-row">
              <span className="muted">
                {comment.trim() ? '거절하면 코멘트를 반영해 고친 뒤 다시 승인을 요청합니다.' : '코멘트 없이 거절하면 작업을 여기서 멈춥니다.'}
              </span>
              <div className="inbox-actions">
                <button onClick={() => decide(a, 'rejected')}>{comment.trim() ? '수정 요청' : '거절'}</button>
                <button className="primary" onClick={() => decide(a, 'approved')}>
                  승인하고 진행
                </button>
              </div>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <main className="page">
      <p className="muted page-intro">
        에이전트가 작업 중에 확인을 요청하거나, 자동 실행(하트비트, 반복 업무) 전에 승인을 받도록 설정한 에이전트의 요청이
        여기에 옵니다. 에이전트 요청을 승인하면 그 작업이 이어서 진행됩니다.
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
