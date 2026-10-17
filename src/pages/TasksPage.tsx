import type { ClaudeCheck } from '../components/AdapterSettings'
import { askConfirm } from '../components/ConfirmDialog'
import { TaskDetail } from '../components/TaskDetail'
import { TaskList } from '../components/TaskList'
import type { Agent, Project, Task } from '../types'

type Props = {
  tasks: Task[]
  agents: Agent[]
  projects: Project[]
  claudeCheck: ClaudeCheck
  runErrors: Record<string, string>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onChange: (id: string, patch: Partial<Task>) => void
  onRun: (task: Task) => void
  onStop: (runId: string) => void
  onDelete: (id: string) => void
}

export function TasksPage(props: Props) {
  const { tasks, agents, projects, claudeCheck, runErrors, selectedId, onSelect, onAdd } = props
  const task = tasks.find((t) => t.id === selectedId) ?? null

  const blockedReason = (t: Task): string | null => {
    if (!t.title.trim() && !t.description.trim()) return '제목이나 설명을 입력하세요.'
    const agent = agents.find((a) => a.id === t.assigneeId)
    if (!agent) return '담당 에이전트를 지정하세요.'
    // Claude Code는 미리 확인해 둔 연결 상태로 막고, 다른 어댑터는 실행할 때 서버가 확인한다
    if (agent.adapter.type === 'claude-code') {
      if (claudeCheck.phase === 'checking') return 'Claude Code 연결 상태를 확인하는 중입니다.'
      if (claudeCheck.phase === 'offline') return '서버에 연결하지 못했습니다. npm run dev로 실행하세요.'
      if (!claudeCheck.status.installed) return 'Claude Code CLI(claude)를 찾을 수 없습니다.'
      if (!claudeCheck.status.loggedIn) return 'Claude Code에 로그인되어 있지 않습니다.'
    }
    if ((agent.adapter.type === 'lmstudio' || agent.adapter.type === 'ollama') && !agent.adapter.model.trim())
      return '담당 에이전트의 로컬 모델 이름을 정하세요.'
    if (agent.status === 'paused') return '담당 에이전트가 일시 정지 상태입니다.'
    if (agent.monthlyBudget > 0 && agent.spentThisMonth >= agent.monthlyBudget) return '담당 에이전트의 이번 달 예산을 모두 썼습니다.'
    const busy = tasks.some((other) => other.runs.some((r) => r.status === 'running' && r.agentId === agent.id))
    if (busy) return '담당 에이전트가 다른 작업을 실행 중입니다.'
    return null
  }

  const remove = async (t: Task) => {
    if (!(await askConfirm(`작업 '${t.title || '제목 없음'}'을 삭제할까요? 실행 기록도 함께 지워집니다.`))) return
    props.onDelete(t.id)
    onSelect(null)
  }

  return (
    <main className="layout">
      <TaskList tasks={tasks} agents={agents} projects={projects} selectedId={selectedId} onSelect={onSelect} />
      {task ? (
        <TaskDetail
          key={task.id}
          task={task}
          tasks={tasks}
          agents={agents}
          projects={projects}
          blockedReason={blockedReason(task)}
          runError={runErrors[task.id] || null}
          onChange={(patch) => props.onChange(task.id, patch)}
          onRun={() => props.onRun(task)}
          onStop={props.onStop}
          onDelete={() => remove(task)}
          onOpen={onSelect}
        />
      ) : (
        <section className="detail empty-state">
          <h1>{tasks.length ? '작업을 선택하세요' : '첫 작업을 만들어 보세요'}</h1>
          <p className="muted">작업을 만들어 에이전트에게 맡기면, 에이전트가 실행하고 결과를 기록으로 남깁니다.</p>
          <button className="primary" onClick={onAdd}>
            새 작업
          </button>
        </section>
      )}
    </main>
  )
}
