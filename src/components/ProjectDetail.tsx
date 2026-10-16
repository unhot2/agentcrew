import { IconChecklist, IconPlus, IconTrash } from '@tabler/icons-react'
import { PROJECT_COLORS, PROJECT_STATUS_LABEL, PROJECT_STATUS_ORDER } from '../projectStore'
import { STATUS_LABEL, STATUS_ORDER, taskKey } from '../taskStore'
import type { Agent, Goal, Project, ProjectStatus, Task } from '../types'
import { Field } from './AdapterSettings'

type Props = {
  project: Project
  tasks: Task[]
  agents: Agent[]
  goals: Goal[]
  onChange: (patch: Partial<Project>) => void
  onDelete: () => void
  onOpenTask: (id: string) => void
  onNewTask: () => void
}

export function ProjectDetail({ project, tasks, agents, goals, onChange, onDelete, onOpenTask, onNewTask }: Props) {
  const own = tasks
    .filter((t) => t.projectId === project.id)
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.number - a.number)
  const done = own.filter((t) => t.status === 'done').length
  const progress = own.length ? Math.round((done / own.length) * 100) : 0
  const cost = own.reduce((sum, t) => sum + t.runs.reduce((s, r) => s + r.costUsd, 0), 0)

  return (
    <section className="detail">
      <header className="detail-header">
        <div className="task-title-wrap">
          <span className="task-key">프로젝트</span>
          <input
            className="task-title"
            value={project.name}
            placeholder="프로젝트 이름"
            aria-label="프로젝트 이름"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="detail-actions">
          <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={onDelete}>
            <IconTrash size={16} />
          </button>
        </div>
      </header>

      <div className="section">
        <div className="grid-3">
          <Field label="상태">
            <select value={project.status} onChange={(e) => onChange({ status: e.target.value as ProjectStatus })}>
              {PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="리드 에이전트">
            <select
              value={project.leadAgentId ?? ''}
              onChange={(e) => onChange({ leadAgentId: e.target.value || null })}
            >
              <option value="">없음</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="field">
            <span className="field-label">색</span>
            <div className="color-swatches" role="radiogroup" aria-label="프로젝트 색">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={project.color === c}
                  aria-label={c}
                  className={`color-swatch${project.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => onChange({ color: c })}
                />
              ))}
            </div>
          </div>
        </div>
        <Field label="목표" hint="목표를 연결하면 이 프로젝트의 작업을 실행할 때 목표를 맥락으로 함께 넘깁니다.">
          <select value={project.goalId ?? ''} onChange={(e) => onChange({ goalId: e.target.value || null })}>
            <option value="">목표 없음</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title || '제목 없는 목표'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="설명">
          <textarea
            rows={4}
            value={project.description}
            placeholder="이 프로젝트의 목표와 범위를 적어주세요"
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>
      </div>

      <div className="section">
        <h2>
          <IconChecklist size={16} aria-hidden /> 작업
          <span className="muted section-meta">
            {done}/{own.length} 완료 · 누적 ${cost.toFixed(2)}
          </span>
        </h2>
        <div className="bar progress">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <ul className="row-list">
          {own.map((t) => {
            const assignee = agents.find((a) => a.id === t.assigneeId)
            return (
              <li key={t.id}>
                <button className="row-link" onClick={() => onOpenTask(t.id)}>
                  <span className="task-key">{taskKey(t)}</span>
                  <span className="row-link-title">{t.title || '제목 없음'}</span>
                  <span className={`task-status status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  <span className="muted">{assignee?.name ?? '담당 없음'}</span>
                </button>
              </li>
            )
          })}
          {own.length === 0 && <li className="empty">이 프로젝트에 속한 작업이 없습니다.</li>}
        </ul>
        <button onClick={onNewTask}>
          <IconPlus size={14} aria-hidden /> 이 프로젝트에 작업 추가
        </button>
      </div>
    </section>
  )
}
