import { adapterLabel } from '../adapters'
import { initials, STATUS_LABEL } from '../components/AgentList'
import type { Agent, Task } from '../types'

type Props = {
  agents: Agent[]
  tasks: Task[]
  onOpenAgent: (id: string) => void
}

export function OrgChartPage({ agents, tasks, onOpenAgent }: Props) {
  const ids = new Set(agents.map((a) => a.id))
  // 보고 대상이 지워졌거나 없으면 최상위로 본다
  const parentOf = (a: Agent) => (a.reportsTo && ids.has(a.reportsTo) ? a.reportsTo : null)
  const childrenOf = (id: string | null) => agents.filter((a) => parentOf(a) === id)

  const openTasks = (agentId: string) =>
    tasks.filter((t) => t.assigneeId === agentId && (t.status === 'todo' || t.status === 'in_progress' || t.status === 'in_review'))
      .length

  const renderNodes = (parent: string | null) => (
    <ul>
      {childrenOf(parent).map((a) => {
        const children = childrenOf(a.id)
        return (
          <li key={a.id}>
            <button className="org-node" onClick={() => onOpenAgent(a.id)}>
              <span className="org-avatar">
                <span className={`avatar adapter-${a.adapter.type}`}>{initials(a.name)}</span>
                <span className={`dot status-${a.status}`} title={STATUS_LABEL[a.status]} />
              </span>
              <span className="org-node-text">
                <span className="org-node-name">{a.name || '이름 없음'}</span>
                <span className="org-node-title">{a.title || '직책 없음'}</span>
                <span className="org-node-meta">
                  {adapterLabel(a.adapter.type)} · 작업 {openTasks(a.id)}
                </span>
              </span>
            </button>
            {children.length > 0 && renderNodes(a.id)}
          </li>
        )
      })}
    </ul>
  )

  if (agents.length === 0) {
    return (
      <main className="page">
        <div className="empty-state">
          <h1>조직도가 비어 있습니다</h1>
          <p className="muted">에이전트를 추가하고 보고 대상을 정하면 여기에 조직도가 그려집니다.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page org-page">
      <p className="muted">카드를 누르면 에이전트 설정으로 이동합니다. 보고 대상은 에이전트 설정에서 바꿀 수 있습니다.</p>
      <div className="org-tree">{renderNodes(null)}</div>
    </main>
  )
}
