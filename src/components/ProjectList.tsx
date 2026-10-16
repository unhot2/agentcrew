import { PROJECT_STATUS_LABEL, PROJECT_STATUS_ORDER } from '../projectStore'
import type { Project, Task } from '../types'

type Props = {
  projects: Project[]
  tasks: Task[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ProjectList({ projects, tasks, selectedId, onSelect }: Props) {
  const sorted = [...projects].sort(
    (a, b) => PROJECT_STATUS_ORDER.indexOf(a.status) - PROJECT_STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name),
  )

  return (
    <aside className="sidebar">
      <ul className="agent-list">
        {sorted.map((p) => {
          const own = tasks.filter((t) => t.projectId === p.id)
          const done = own.filter((t) => t.status === 'done').length
          return (
            <li key={p.id}>
              <button className={`agent-row${p.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(p.id)}>
                <span className="project-swatch" style={{ background: p.color }} />
                <span className="agent-row-text">
                  <span className="agent-row-name">{p.name || '이름 없는 프로젝트'}</span>
                  <span className="agent-row-sub">
                    {PROJECT_STATUS_LABEL[p.status]} · 작업 {done}/{own.length}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {projects.length === 0 && <li className="empty">프로젝트가 없습니다.</li>}
      </ul>
    </aside>
  )
}
