import { useState } from 'react'
import type { ServerState } from '../api'

type Props = {
  data: ServerState
  onOpenTask: (id: string) => void
  onOpenAgent: (id: string) => void
}

const TYPE_LABEL: Record<string, string> = {
  task: '작업',
  run: '실행',
  agent: '에이전트',
  project: '프로젝트',
  goal: '목표',
  routine: '반복 업무',
  approval: '승인',
  skill: '스킬',
  connector: '연결',
  system: '시스템',
}

export function ActivityPage({ data, onOpenTask, onOpenAgent }: Props) {
  const [type, setType] = useState('')
  const entries = data.activity.filter((e) => !type || e.type === type)

  // 날짜별로 묶어서 보여준다
  const groups: { day: string; items: typeof entries }[] = []
  for (const e of entries) {
    const day = new Date(e.at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(e)
    else groups.push({ day, items: [e] })
  }

  return (
    <main className="page">
      <div className="toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="종류로 거르기">
          <option value="">모든 활동</option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="muted">최근 {data.activity.length}건까지 보관합니다.</span>
      </div>
      {groups.length === 0 && <p className="muted">아직 기록된 활동이 없습니다.</p>}
      {groups.map((g) => (
        <section key={g.day} className="activity-day">
          <h2>{g.day}</h2>
          <ul className="activity-list">
            {g.items.map((e) => (
              <li key={e.id}>
                <span className="activity-time">
                  {new Date(e.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="activity-type">{TYPE_LABEL[e.type] ?? e.type}</span>
                <span className="activity-message">{e.message}</span>
                {e.taskId && data.tasks.some((t) => t.id === e.taskId) && (
                  <button className="link-button" onClick={() => onOpenTask(e.taskId!)}>
                    작업 보기
                  </button>
                )}
                {!e.taskId && e.agentId && data.agents.some((a) => a.id === e.agentId) && (
                  <button className="link-button" onClick={() => onOpenAgent(e.agentId!)}>
                    에이전트 보기
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
