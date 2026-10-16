import { useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, taskKey } from '../taskStore'
import type { Agent, Project, Task, TaskStatus } from '../types'
import { initials } from './AgentList'

type Filter = 'open' | 'closed' | 'all'

const FILTERS: { value: Filter; label: string; statuses: TaskStatus[] }[] = [
  { value: 'open', label: '진행할 작업', statuses: ['todo', 'in_progress', 'in_review'] },
  { value: 'closed', label: '끝난 작업', statuses: ['done', 'cancelled'] },
  { value: 'all', label: '전체', statuses: STATUS_ORDER },
]

type Props = {
  tasks: Task[]
  agents: Agent[]
  projects: Project[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function TaskList({ tasks, agents, projects, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>('open')
  // '' = 모든 프로젝트, 'none' = 프로젝트 없음
  const [projectFilter, setProjectFilter] = useState('')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const statuses = FILTERS.find((f) => f.value === filter)!.statuses

  const inProject = (t: Task) =>
    projectFilter === '' || (projectFilter === 'none' ? !t.projectId : t.projectId === projectFilter)

  const visible = tasks
    .filter(inProject)
    .filter((t) => statuses.includes(t.status))
    .filter((t) => !q || `${taskKey(t)} ${t.title}`.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
        b.number - a.number,
    )

  const count = (f: (typeof FILTERS)[number]) => tasks.filter((t) => inProject(t) && f.statuses.includes(t.status)).length

  return (
    <aside className="sidebar">
      <label className="search">
        <IconSearch size={14} aria-hidden />
        <input placeholder="작업 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {projects.length > 0 && (
        <select
          className="project-filter"
          aria-label="프로젝트로 거르기"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">모든 프로젝트</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || '이름 없는 프로젝트'}
            </option>
          ))}
          <option value="none">프로젝트 없음</option>
        </select>
      )}
      <div className="filter-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            className={filter === f.value ? 'selected' : ''}
            onClick={() => setFilter(f.value)}
          >
            {f.label} <span className="count">{count(f)}</span>
          </button>
        ))}
      </div>
      <ul className="agent-list">
        {visible.map((t) => {
          const assignee = agents.find((a) => a.id === t.assigneeId)
          const project = projects.find((p) => p.id === t.projectId)
          const running = t.runs.some((r) => r.status === 'running')
          return (
            <li key={t.id}>
              <button
                className={`agent-row task-row${t.id === selectedId ? ' selected' : ''}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="agent-row-text">
                  <span className="task-row-key">
                    {t.parentTaskId && <span title="위임받은 하위 작업">↳</span>}
                    {taskKey(t)}
                    {project && (
                      <span className="task-project">
                        <span className="project-swatch small" style={{ background: project.color }} />
                        {project.name || '이름 없음'}
                      </span>
                    )}
                    {(t.priority === 'urgent' || t.priority === 'high') && (
                      <span className={`priority priority-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                    )}
                  </span>
                  <span className="agent-row-name">{t.title || '제목 없음'}</span>
                  <span className="agent-row-sub">
                    <span className={`task-status status-${t.status}`}>{running ? '실행 중' : STATUS_LABEL[t.status]}</span>
                    {' · '}
                    {assignee?.name ?? '담당 없음'}
                  </span>
                </span>
                {assignee && (
                  <span className={`avatar adapter-${assignee.adapter.type}`} title={assignee.name}>
                    {initials(assignee.name)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {visible.length === 0 && <li className="empty">{q ? '검색 결과가 없습니다.' : '작업이 없습니다.'}</li>}
      </ul>
    </aside>
  )
}
