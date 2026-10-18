import { IconArrowUpRight, IconPlayerPlay, IconPlayerStop, IconSubtask, IconTerminal2, IconTrash } from '@tabler/icons-react'
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, taskKey } from '../taskStore'
import type { Agent, Project, Task, TaskPriority, TaskStatus } from '../types'
import { Field } from './AdapterSettings'
import { RUN_STATUS_TEXT, RunLog } from './RunLog'
import { TaskReport } from './TaskReport'

type Props = {
  task: Task
  /** 상위, 하위 작업을 찾기 위한 전체 작업 */
  tasks: Task[]
  agents: Agent[]
  projects: Project[]
  blockedReason: string | null
  runError: string | null
  onChange: (patch: Partial<Task>) => void
  onRun: () => void
  onStop: (runId: string) => void
  onDelete: () => void
  onOpen: (id: string) => void
}

export function TaskDetail({ task, tasks, agents, projects, blockedReason, runError, onChange, onRun, onStop, onDelete, onOpen }: Props) {
  const parent = tasks.find((t) => t.id === task.parentTaskId)
  const children = tasks.filter((t) => t.parentTaskId === task.id)
  const nameOf = (id: string | null) => agents.find((a) => a.id === id)?.name ?? '담당 없음'
  // 프로젝트에 폴더가 있으면 그 폴더, 없으면 담당 에이전트의 폴더에서 실행된다
  const project = projects.find((p) => p.id === task.projectId)
  const assignee = agents.find((a) => a.id === task.assigneeId)
  const runFolder = project?.workdir
    ? { path: project.workdir, from: `프로젝트 ${project.name || '이름 없음'}의 폴더` }
    : assignee
      ? { path: assignee.workdir, from: `${assignee.name}의 작업 디렉터리` }
      : null
  const activeRun = task.runs.find((r) => r.status === 'running')
  const runs = [...task.runs].reverse()
  const totalCost = task.runs.reduce((sum, r) => sum + r.costUsd, 0)

  return (
    <section className="detail">
      <header className="detail-header">
        <div className="task-title-wrap">
          <span className="task-key">{taskKey(task)}</span>
          <input
            className={`task-title${task.title ? '' : ' empty'}`}
            value={task.title}
            placeholder="작업 제목을 입력하세요"
            aria-label="작업 제목"
            // 새로 만든 작업은 바로 제목을 적을 수 있게 한다
            autoFocus={!task.title && !task.description && task.runs.length === 0}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <div className="detail-actions">
          <button
            className="icon-button danger"
            aria-label="삭제"
            title={activeRun ? '실행 중에는 삭제할 수 없습니다' : '삭제'}
            disabled={!!activeRun}
            onClick={onDelete}
          >
            <IconTrash size={16} />
          </button>
        </div>
      </header>

      <div className="section">
        <div className="grid-4">
          <Field label="상태">
            <select value={task.status} onChange={(e) => onChange({ status: e.target.value as TaskStatus })}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="우선순위">
            <select value={task.priority} onChange={(e) => onChange({ priority: e.target.value as TaskPriority })}>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="담당 에이전트">
            <select
              value={task.assigneeId ?? ''}
              onChange={(e) => onChange({ assigneeId: e.target.value || null })}
            >
              <option value="">담당 없음</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="프로젝트">
            <select value={task.projectId ?? ''} onChange={(e) => onChange({ projectId: e.target.value || null })}>
              <option value="">프로젝트 없음</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || '이름 없는 프로젝트'}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="설명">
          <textarea
            rows={12}
            value={task.description}
            placeholder="에이전트가 할 일을 자세히 적어주세요. 완료 기준이 있으면 함께 적으면 좋습니다."
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={!!task.noDelegation} onChange={(e) => onChange({ noDelegation: e.target.checked })} />
          <span>
            위임 금지
            <span className="muted"> · 담당 에이전트가 하위 에이전트에게 넘기지 않고 직접 합니다</span>
          </span>
        </label>
      </div>

      {parent && (
        <div className="parent-link">
          <IconArrowUpRight size={14} aria-hidden />
          <span className="muted">{nameOf(parent.assigneeId)}가 맡긴 일 ·</span>
          <button className="link-button" onClick={() => onOpen(parent.id)}>
            {taskKey(parent)} {parent.title}
          </button>
        </div>
      )}

      <TaskReport
        task={task}
        children={children}
        agents={agents}
        // 결재하면 작업을 완료로, 결재를 취소하면 다시 검토 대기로 돌린다
        onSign={(signedAt) =>
          onChange(signedAt ? { reportSignedAt: signedAt, status: 'done' } : { reportSignedAt: null, status: task.status === 'done' ? 'in_review' : task.status })
        }
      />

      {children.length > 0 && (
        <div className="section">
          <h2>
            <IconSubtask size={16} aria-hidden /> 하위 작업
            <span className="muted section-meta">
              {children.filter((t) => t.status === 'done').length}/{children.length} 완료
            </span>
          </h2>
          <ul className="row-list">
            {children.map((t) => (
              <li key={t.id}>
                <button className="row-link" onClick={() => onOpen(t.id)}>
                  <span className="task-key">{taskKey(t)}</span>
                  <span className="row-link-title">{t.title}</span>
                  <span className={`task-status status-${t.status}`}>
                    {t.runs.some((r) => r.status === 'running') ? '실행 중' : STATUS_LABEL[t.status]}
                  </span>
                  <span className="muted">{nameOf(t.assigneeId)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <h2>
          <IconTerminal2 size={16} aria-hidden /> 실행
          {totalCost > 0 && <span className="muted section-meta">누적 ${totalCost.toFixed(2)}</span>}
        </h2>
        {runFolder && (
          <p className="muted run-folder">
            실행 폴더: <span className="mono">{runFolder.path}</span> ({runFolder.from})
          </p>
        )}
        <div className="run-actions">
          {blockedReason && !activeRun && <span className="blocked-reason">{blockedReason}</span>}
          {activeRun ? (
            <button onClick={() => onStop(activeRun.id)}>
              <IconPlayerStop size={14} aria-hidden /> 중지
            </button>
          ) : (
            <button className="primary" onClick={onRun} disabled={!!blockedReason}>
              <IconPlayerPlay size={14} aria-hidden /> 지금 실행
            </button>
          )}
        </div>

        {runError && !activeRun && <p className="error-text">실행하지 못했습니다: {runError}</p>}
        {runs.length === 0 && <p className="muted">아직 실행 기록이 없습니다.</p>}
        {runs.map((r, i) => {
          const agent = agents.find((a) => a.id === r.agentId)
          return (
            <details key={r.id} className="run-item" open={i === 0}>
              <summary>
                <span className={`run-status run-${r.status}`}>{RUN_STATUS_TEXT[r.status]}</span>
                <span>실행 #{task.runs.length - i}</span>
                <span className="muted">
                  {agent?.name ?? '삭제된 에이전트'} · {new Date(r.startedAt).toLocaleString('ko-KR')}
                  {r.costUsd > 0 && ` · $${r.costUsd.toFixed(4)}`}
                </span>
              </summary>
              <RunLog events={r.events} />
            </details>
          )
        })}
      </div>
    </section>
  )
}
