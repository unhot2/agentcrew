import { IconTrash } from '@tabler/icons-react'
import type { ServerState } from '../api'
import { Field } from '../components/AdapterSettings'
import { EmptyDetail, SimpleList } from '../components/SimpleList'
import { PROJECT_STATUS_LABEL } from '../projectStore'
import type { Goal, GoalStatus } from '../types'

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: '진행 중',
  achieved: '달성',
  abandoned: '중단',
}

type Props = {
  data: ServerState
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onChange: (id: string, patch: Partial<Goal>) => void
  onDelete: (id: string) => void
  onOpenProject: (id: string) => void
}

export function GoalsPage({ data, selectedId, onSelect, onAdd, onChange, onDelete, onOpenProject }: Props) {
  const goal = data.goals.find((g) => g.id === selectedId) ?? null

  const progressOf = (goalId: string) => {
    const projectIds = new Set(data.projects.filter((p) => p.goalId === goalId).map((p) => p.id))
    const tasks = data.tasks.filter((t) => t.projectId && projectIds.has(t.projectId))
    const done = tasks.filter((t) => t.status === 'done').length
    return { projects: projectIds.size, tasks: tasks.length, done }
  }

  const items = data.goals.map((g) => {
    const p = progressOf(g.id)
    return {
      id: g.id,
      title: g.title || '제목 없는 목표',
      sub: `${GOAL_STATUS_LABEL[g.status]} · 작업 ${p.done}/${p.tasks}`,
      dim: g.status !== 'active',
    }
  })

  const remove = (g: Goal) => {
    if (!window.confirm(`목표 '${g.title || '제목 없음'}'을 삭제할까요? 연결된 프로젝트는 목표 없음으로 남습니다.`)) return
    onDelete(g.id)
    onSelect(null)
  }

  return (
    <main className="layout">
      <SimpleList items={items} selectedId={selectedId} empty="목표가 없습니다." onSelect={onSelect} />
      {goal ? (
        <section className="detail" key={goal.id}>
          <header className="detail-header">
            <div className="task-title-wrap">
              <span className="task-key">목표</span>
              <input
                className="task-title"
                value={goal.title}
                placeholder="목표 제목"
                aria-label="목표 제목"
                onChange={(e) => onChange(goal.id, { title: e.target.value })}
              />
            </div>
            <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={() => remove(goal)}>
              <IconTrash size={16} />
            </button>
          </header>
          <div className="section">
            <div className="grid-2">
              <Field label="상태">
                <select value={goal.status} onChange={(e) => onChange(goal.id, { status: e.target.value as GoalStatus })}>
                  {Object.entries(GOAL_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="목표 날짜">
                <input type="date" value={goal.targetDate} onChange={(e) => onChange(goal.id, { targetDate: e.target.value })} />
              </Field>
            </div>
            <Field label="설명" hint="에이전트가 이 목표에 속한 작업을 할 때 맥락으로 함께 받습니다.">
              <textarea
                rows={4}
                value={goal.description}
                placeholder="무엇을 왜 이루려는지 적어주세요"
                onChange={(e) => onChange(goal.id, { description: e.target.value })}
              />
            </Field>
          </div>
          <div className="section">
            <h2>연결된 프로젝트</h2>
            <ul className="row-list">
              {data.projects
                .filter((p) => p.goalId === goal.id)
                .map((p) => {
                  const tasks = data.tasks.filter((t) => t.projectId === p.id)
                  const done = tasks.filter((t) => t.status === 'done').length
                  return (
                    <li key={p.id}>
                      <button className="row-link" onClick={() => onOpenProject(p.id)}>
                        <span className="project-swatch" style={{ background: p.color }} />
                        <span className="row-link-title">{p.name || '이름 없는 프로젝트'}</span>
                        <span className="muted">{PROJECT_STATUS_LABEL[p.status]}</span>
                        <span className="muted num">
                          {done}/{tasks.length}
                        </span>
                      </button>
                    </li>
                  )
                })}
              {!data.projects.some((p) => p.goalId === goal.id) && (
                <li className="empty">프로젝트 화면에서 이 목표를 고르면 여기에 연결됩니다.</li>
              )}
            </ul>
          </div>
        </section>
      ) : (
        <EmptyDetail
          title={data.goals.length ? '목표를 선택하세요' : '첫 목표를 정해 보세요'}
          body="목표를 정하고 프로젝트를 연결하면, 에이전트가 왜 이 일을 하는지 맥락을 함께 받습니다."
          action="새 목표"
          onAction={onAdd}
        />
      )}
    </main>
  )
}
