import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type {
  Agent,
  Approval,
  Connector,
  Goal,
  Project,
  Routine,
  Settings,
  Skill,
  Task,
  TaskRun,
} from '../src/types.ts'
import type { RunEvent } from '../src/runTypes.ts'
import { setTaskPrefix, taskKey, taskPrompt } from '../src/taskStore.ts'
import { DELEGATION_GUIDE, checkParentDone, hasTeam, issueGrant, revokeGrant } from './delegation.ts'
import { startRun, validate } from './runner.ts'
import { isEmpty, log, persist, state, type State } from './db.ts'
import { connectorEnv, notify, testConnector } from './notify.ts'
import { nextRunAt } from './schedule.ts'

setTaskPrefix(state.settings.taskPrefix)

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}

const now = () => new Date().toISOString()

const AGENT_FIELDS: (keyof Agent)[] = [
  'name',
  'title',
  'description',
  'reportsTo',
  'workdir',
  'adapter',
  'instructions',
  'heartbeatMinutes',
  'heartbeatEnabled',
  'requireApproval',
  'skillIds',
  'monthlyBudget',
]
const TASK_FIELDS: (keyof Task)[] = ['title', 'description', 'status', 'priority', 'assigneeId', 'projectId']
const PROJECT_FIELDS: (keyof Project)[] = ['name', 'description', 'status', 'color', 'leadAgentId', 'goalId']
const GOAL_FIELDS: (keyof Goal)[] = ['title', 'description', 'status', 'targetDate']
const ROUTINE_FIELDS: (keyof Routine)[] = [
  'name',
  'description',
  'assigneeId',
  'projectId',
  'priority',
  'schedule',
  'enabled',
  'runImmediately',
]
const SKILL_FIELDS: (keyof Skill)[] = ['name', 'description', 'content']

const agentName = (id: string | null | undefined) => state.agents.find((a) => a.id === id)?.name ?? '알 수 없는 에이전트'

/** 화면으로 보내는 데이터. 연결의 토큰과 주소는 가린다 */
export function publicState() {
  return {
    ...state,
    connectors: state.connectors.map((c) => ({ ...c, secret: '', hasSecret: !!c.secret })),
  }
}

/** 처음 한 번, 브라우저에 있던 데이터를 서버로 옮긴다. 서버에 이미 데이터가 있으면 거절한다 */
export function importState(data: Partial<State>) {
  if (!isEmpty()) throw new ApiError(409, '서버에 이미 데이터가 있어 가져오지 않았습니다.')
  state.agents = (data.agents ?? []).map((a) => ({ ...a, status: a.status === 'running' ? 'idle' : a.status }))
  state.tasks = (data.tasks ?? []).map((t) => ({
    ...t,
    runs: (t.runs ?? []).map((r) => (r.status === 'running' ? { ...r, status: 'failed' as const } : r)),
  }))
  state.projects = data.projects ?? []
  log('system', '브라우저에 있던 데이터를 서버로 옮겼습니다.')
}

// ---------- 에이전트 ----------

/** 사용 비용과 실행 상태는 서버가 관리하므로 화면에서 보낸 값으로 덮어쓰지 않는다 */
export function putAgent(id: string, body: Agent) {
  const existing = state.agents.find((a) => a.id === id)
  const fields = pick(body, AGENT_FIELDS)
  const wanted = body.status === 'paused' ? 'paused' : 'idle'
  if (existing) {
    const wasPaused = existing.status === 'paused'
    Object.assign(existing, fields)
    if (existing.status !== 'running') existing.status = wanted
    if (wasPaused !== (existing.status === 'paused')) {
      log('agent', `${existing.name} 에이전트를 ${existing.status === 'paused' ? '일시 정지했습니다' : '다시 켰습니다'}.`, { agentId: id })
    } else {
      log('agent', `${existing.name} 에이전트 설정을 저장했습니다.`, { agentId: id })
    }
  } else {
    state.agents.push({ ...(fields as Agent), id, status: wanted, spentThisMonth: 0 })
    log('agent', `${body.name} 에이전트를 만들었습니다.`, { agentId: id })
  }
  persist()
  return state.agents.find((a) => a.id === id)!
}

/** 하위 에이전트는 지운 에이전트의 상위로 올리고, 프로젝트 리드와 반복 업무 담당에서도 뺀다 */
export function deleteAgent(id: string) {
  const agent = state.agents.find((a) => a.id === id)
  if (!agent) throw new ApiError(404, '에이전트를 찾을 수 없습니다.')
  if (agent.status === 'running') throw new ApiError(409, '실행 중인 에이전트는 삭제할 수 없습니다.')
  state.agents = state.agents
    .filter((a) => a.id !== id)
    .map((a) => (a.reportsTo === id ? { ...a, reportsTo: agent.reportsTo } : a))
  for (const p of state.projects) if (p.leadAgentId === id) p.leadAgentId = null
  for (const r of state.routines) if (r.assigneeId === id) r.assigneeId = null
  log('agent', `${agent.name} 에이전트를 삭제했습니다.`)
}

// ---------- 작업 ----------

/** 없으면 만들고, 있으면 화면에서 고칠 수 있는 칸만 반영한다. 실행 기록은 서버만 쓴다 */
export function putTask(id: string, body: Task) {
  const existing = state.tasks.find((t) => t.id === id)
  if (existing) {
    const before = { status: existing.status, assigneeId: existing.assigneeId }
    Object.assign(existing, pick(body, TASK_FIELDS), { updatedAt: now() })
    const key = taskKey(existing)
    if (before.status !== existing.status) {
      log('task', `${key} 상태를 ${existing.status}(으)로 바꿨습니다.`, { taskId: id })
      if (existing.status === 'done' || existing.status === 'cancelled') checkParentDone(existing)
    }
    if (before.assigneeId !== existing.assigneeId) {
      const who = existing.assigneeId ? agentName(existing.assigneeId) : '담당 없음'
      log('task', `${key} 담당을 ${who}(으)로 바꿨습니다.`, { taskId: id, agentId: existing.assigneeId ?? undefined })
    }
  } else {
    const number = Math.max(body.number || 0, ...state.tasks.map((t) => t.number + 1), 1)
    state.tasks.unshift({ ...body, id, number, runs: [], createdAt: body.createdAt ?? now(), updatedAt: now() })
    log('task', `작업 ${taskKey({ number })}을 만들었습니다.`, { taskId: id })
  }
  persist()
  return state.tasks.find((t) => t.id === id)!
}

export function deleteTask(id: string) {
  const task = state.tasks.find((t) => t.id === id)
  if (!task) throw new ApiError(404, '작업을 찾을 수 없습니다.')
  if (task.runs.some((r) => r.status === 'running')) throw new ApiError(409, '실행 중인 작업은 삭제할 수 없습니다.')
  state.tasks = state.tasks.filter((t) => t.id !== id)
  for (const t of state.tasks) if (t.parentTaskId === id) t.parentTaskId = null
  state.approvals = state.approvals.filter((a) => a.taskId !== id)
  log('task', `${taskKey(task)} ${task.title} 작업을 삭제했습니다.`)
}

// ---------- 프로젝트, 목표, 반복 업무, 스킬 ----------

export function putProject(id: string, body: Project) {
  const existing = state.projects.find((p) => p.id === id)
  if (existing) {
    const before = existing.status
    Object.assign(existing, pick(body, PROJECT_FIELDS))
    if (before !== existing.status) log('project', `${existing.name} 프로젝트 상태를 바꿨습니다.`, { projectId: id })
  } else {
    state.projects.push({ ...body, id, createdAt: body.createdAt ?? now() })
    log('project', '새 프로젝트를 만들었습니다.', { projectId: id })
  }
  persist()
  return state.projects.find((p) => p.id === id)!
}

/** 프로젝트의 작업은 지우지 않고 프로젝트 없음으로 남긴다 */
export function deleteProject(id: string) {
  const project = state.projects.find((p) => p.id === id)
  state.projects = state.projects.filter((p) => p.id !== id)
  for (const t of state.tasks) if (t.projectId === id) t.projectId = null
  for (const r of state.routines) if (r.projectId === id) r.projectId = null
  log('project', `${project?.name || '이름 없는'} 프로젝트를 삭제했습니다.`)
}

export function putGoal(id: string, body: Goal) {
  const existing = state.goals.find((g) => g.id === id)
  if (existing) Object.assign(existing, pick(body, GOAL_FIELDS))
  else {
    state.goals.push({ ...body, id, createdAt: body.createdAt ?? now() })
    log('goal', '새 목표를 만들었습니다.')
  }
  persist()
  return state.goals.find((g) => g.id === id)!
}

export function deleteGoal(id: string) {
  const goal = state.goals.find((g) => g.id === id)
  state.goals = state.goals.filter((g) => g.id !== id)
  for (const p of state.projects) if (p.goalId === id) p.goalId = null
  log('goal', `${goal?.title || '제목 없는'} 목표를 삭제했습니다.`)
}

/** 일정이나 켜짐 여부가 바뀌면 다음 실행 시각을 다시 계산한다 */
export function putRoutine(id: string, body: Routine) {
  const existing = state.routines.find((r) => r.id === id)
  const fields = pick(body, ROUTINE_FIELDS)
  if (existing) {
    const scheduleChanged =
      JSON.stringify(existing.schedule) !== JSON.stringify(fields.schedule ?? existing.schedule) ||
      existing.enabled !== (fields.enabled ?? existing.enabled)
    Object.assign(existing, fields)
    if (scheduleChanged) existing.nextRunAt = existing.enabled ? nextRunAt(existing.schedule) : null
  } else {
    const routine: Routine = { ...body, ...fields, id, lastRunAt: null, createdAt: body.createdAt ?? now(), nextRunAt: null }
    routine.nextRunAt = routine.enabled ? nextRunAt(routine.schedule) : null
    state.routines.push(routine)
    log('routine', '새 반복 업무를 만들었습니다.')
  }
  persist()
  return state.routines.find((r) => r.id === id)!
}

export function deleteRoutine(id: string) {
  const routine = state.routines.find((r) => r.id === id)
  state.routines = state.routines.filter((r) => r.id !== id)
  log('routine', `${routine?.name || '이름 없는'} 반복 업무를 삭제했습니다.`)
}

export function putSkill(id: string, body: Skill) {
  const existing = state.skills.find((s) => s.id === id)
  if (existing) Object.assign(existing, pick(body, SKILL_FIELDS))
  else {
    state.skills.push({ ...body, id, createdAt: body.createdAt ?? now() })
    log('skill', '새 스킬을 만들었습니다.')
  }
  persist()
  return state.skills.find((s) => s.id === id)!
}

/** 스킬을 지우면 그 스킬을 쓰던 에이전트에서도 뺀다 */
export function deleteSkill(id: string) {
  const skill = state.skills.find((s) => s.id === id)
  state.skills = state.skills.filter((s) => s.id !== id)
  for (const a of state.agents) if (a.skillIds?.includes(id)) a.skillIds = a.skillIds.filter((s) => s !== id)
  log('skill', `${skill?.name || '이름 없는'} 스킬을 삭제했습니다.`)
}

// ---------- 연결, 설정 ----------

/** 토큰과 주소는 새로 입력했을 때만 바꾼다 (화면에는 가려진 값만 있으므로) */
export function putConnector(id: string, body: Connector) {
  const existing = state.connectors.find((c) => c.id === id)
  const secret = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : null
  if (existing) {
    existing.name = body.name ?? existing.name
    existing.enabled = !!body.enabled
    if (secret) existing.secret = secret
  } else {
    if (!['github', 'slack', 'webhook'].includes(body.type)) throw new ApiError(400, '지원하지 않는 연결입니다.')
    state.connectors.push({ id, type: body.type, name: body.name, enabled: !!body.enabled, secret: secret ?? '', createdAt: now() })
    log('connector', `${body.name} 연결을 추가했습니다.`)
  }
  persist()
  const saved = state.connectors.find((c) => c.id === id)!
  return { ...saved, secret: '', hasSecret: !!saved.secret }
}

export function deleteConnector(id: string) {
  const c = state.connectors.find((x) => x.id === id)
  state.connectors = state.connectors.filter((x) => x.id !== id)
  log('connector', `${c?.name ?? ''} 연결을 삭제했습니다.`)
}

export async function checkConnector(id: string) {
  const c = state.connectors.find((x) => x.id === id)
  if (!c) throw new ApiError(404, '연결을 찾을 수 없습니다.')
  try {
    return { message: await testConnector(c) }
  } catch (err) {
    throw new ApiError(400, `연결 확인 실패: ${(err as Error).message}`)
  }
}

export function putSettings(body: Partial<Settings>) {
  const before = state.settings.automationEnabled
  if (typeof body.workspaceBase === 'string') state.settings.workspaceBase = body.workspaceBase.trim()
  if (typeof body.taskPrefix === 'string') state.settings.taskPrefix = body.taskPrefix.trim().toUpperCase() || 'AC'
  if (typeof body.automationEnabled === 'boolean') state.settings.automationEnabled = body.automationEnabled
  setTaskPrefix(state.settings.taskPrefix)
  if (before !== state.settings.automationEnabled) {
    log('system', state.settings.automationEnabled ? '자동 실행을 켰습니다.' : '자동 실행을 모두 멈췄습니다.')
  } else {
    log('system', '설정을 저장했습니다.')
  }
  return state.settings
}

// ---------- 결과물 ----------

const MAX_PREVIEW = 300 * 1024

/** 에이전트가 기록한 파일만 읽는다 (임의 경로 읽기 방지) */
export function artifactContent(id: string) {
  const artifact = state.artifacts.find((a) => a.id === id)
  if (!artifact) throw new ApiError(404, '결과물을 찾을 수 없습니다.')
  if (!existsSync(artifact.path)) return { exists: false, size: 0, content: '', truncated: false }
  const size = statSync(artifact.path).size
  const buffer = readFileSync(artifact.path)
  const truncated = size > MAX_PREVIEW
  return { exists: true, size, content: buffer.subarray(0, MAX_PREVIEW).toString('utf8'), truncated }
}

// ---------- 실행, 승인 ----------

export type RunSource = 'manual' | 'heartbeat' | 'routine' | 'approval'

const SOURCE_LABEL: Record<RunSource, string> = {
  manual: '직접 실행',
  heartbeat: '하트비트',
  routine: '반복 업무',
  approval: '승인 후 실행',
}

/** 에이전트 지시문 뒤에 배정된 스킬 내용과, 팀이 있으면 위임 안내를 붙인다 */
function systemPromptFor(agent: Agent) {
  const parts = [agent.instructions.trim()]
  for (const id of agent.skillIds ?? []) {
    const skill = state.skills.find((s) => s.id === id)
    if (skill?.content.trim()) parts.push(`## 스킬: ${skill.name}\n${skill.content.trim()}`)
  }
  if (hasTeam(agent.id)) parts.push(DELEGATION_GUIDE)
  return parts.filter(Boolean).join('\n\n')
}

/** 작업을 담당 에이전트로 실행하고, 실행 로그, 비용, 결과물을 작업과 에이전트에 기록한다 */
export function runTask(taskId: string, source: RunSource = 'manual'): TaskRun {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) throw new ApiError(404, '작업을 찾을 수 없습니다.')
  if (!task.title.trim()) throw new ApiError(400, '제목을 입력하세요.')
  const agent = state.agents.find((a) => a.id === task.assigneeId)
  if (!agent) throw new ApiError(400, '담당 에이전트를 지정하세요.')
  if (agent.status === 'paused') throw new ApiError(400, '담당 에이전트가 일시 정지 상태입니다.')
  const project = state.projects.find((p) => p.id === task.projectId)
  const goal = state.goals.find((g) => g.id === project?.goalId)
  const parent = state.tasks.find((t) => t.id === task.parentTaskId)
  const delegator = state.agents.find((a) => a.id === parent?.assigneeId)?.name
  const prompt = taskPrompt(task, { project, goal, parent, delegator })
  const error = validate(agent, prompt)
  if (error) throw new ApiError(400, error)

  const key = taskKey(task)
  const taskRun: TaskRun = {
    id: '',
    agentId: agent.id,
    startedAt: now(),
    status: 'running',
    costUsd: 0,
    events: [],
  }

  const onEvent = (e: RunEvent) => {
    taskRun.events.push(e)
    const owner = state.agents.find((a) => a.id === agent.id)
    if (e.kind === 'tool' && e.path) {
      const path = isAbsolute(e.path) ? e.path : resolve(agent.workdir, e.path)
      const already = state.artifacts.some((a) => a.runId === taskRun.id && a.path === path)
      if (!already) {
        state.artifacts.unshift({ id: randomUUID(), path, action: e.name, taskId, runId: taskRun.id, agentId: agent.id, at: now() })
      }
    }
    if (e.kind === 'result') {
      taskRun.costUsd = e.costUsd
      if (owner) owner.spentThisMonth += e.costUsd
    }
    if (e.kind === 'exit') {
      if (delegation) revokeGrant(delegation.token)
      taskRun.status = e.status
      const current = state.tasks.find((t) => t.id === taskId)
      if (current && e.status === 'completed' && current.status === 'in_progress') {
        current.status = 'in_review'
        current.updatedAt = now()
      }
      if (owner && owner.status === 'running') owner.status = 'idle'
      const result = { completed: '완료', failed: '실패', stopped: '중지', running: '실행 중' }[e.status]
      log('run', `${agent.name}의 ${key} 실행이 ${result}됐습니다. ($${taskRun.costUsd.toFixed(2)})`, {
        taskId,
        agentId: agent.id,
      })
      notify(`run.${e.status}`, `${agent.name}: ${key} ${task.title} 실행 ${result}`, { taskId, agentId: agent.id })
    }
    persist()
  }

  // 팀이 있는 에이전트에게만 위임 도구를 준다. 토큰은 이 실행이 끝나면 버린다
  const delegation = hasTeam(agent.id) ? issueGrant({ runId: '', agentId: agent.id, taskId }) : null
  // 이벤트는 모두 비동기로 오므로 id를 바로 채워 넣어도 순서가 꼬이지 않는다
  const run = startRun(agent, prompt, onEvent, { systemPrompt: systemPromptFor(agent), env: connectorEnv(), delegation })
  taskRun.id = run.id
  task.runs.push(taskRun)
  task.status = 'in_progress'
  task.updatedAt = now()
  agent.status = 'running'
  log('run', `${agent.name}가 ${key} ${task.title} 실행을 시작했습니다. (${SOURCE_LABEL[source]})`, {
    taskId,
    agentId: agent.id,
  })
  return taskRun
}

/** 승인이 필요한 에이전트인지. 모든 권한을 우회하는 모드는 항상 승인을 받는다 */
export function needsApproval(agent: Agent) {
  const bypass = agent.adapter.type === 'claude-code' && agent.adapter.permissionMode === 'bypassPermissions'
  return !!agent.requireApproval || bypass
}

/** 자동 실행 요청. 승인이 필요하면 승인 요청을 만들고, 아니면 바로 실행한다. 실패는 활동 기록에 남긴다 */
export function requestRun(task: Task, source: 'heartbeat' | 'routine') {
  const agent = state.agents.find((a) => a.id === task.assigneeId)
  if (!agent) return
  if (needsApproval(agent)) {
    if (state.approvals.some((a) => a.taskId === task.id && a.status === 'pending')) return
    const approval: Approval = {
      id: randomUUID(),
      taskId: task.id,
      agentId: agent.id,
      reason: agent.requireApproval ? '이 에이전트는 실행 전에 승인을 받도록 설정돼 있습니다.' : '모든 권한을 우회하는 모드로 실행합니다.',
      source,
      status: 'pending',
      requestedAt: now(),
      decidedAt: null,
    }
    state.approvals.unshift(approval)
    log('approval', `${agent.name}가 ${taskKey(task)} 실행 승인을 요청했습니다.`, { taskId: task.id, agentId: agent.id })
    notify('approval.requested', `${agent.name}: ${taskKey(task)} ${task.title} 실행 승인 요청`, { taskId: task.id })
    return
  }
  try {
    runTask(task.id, source)
  } catch (err) {
    log('run', `${agent.name}의 ${taskKey(task)} 자동 실행 실패: ${(err as Error).message}`, {
      taskId: task.id,
      agentId: agent.id,
    })
  }
}

/** 승인하면 바로 실행한다. 실행이 거절되면 승인은 남기고 이유를 돌려준다 */
export function decideApproval(id: string, decision: 'approved' | 'rejected') {
  const approval = state.approvals.find((a) => a.id === id)
  if (!approval) throw new ApiError(404, '승인 요청을 찾을 수 없습니다.')
  if (approval.status !== 'pending') throw new ApiError(409, '이미 처리한 요청입니다.')
  approval.status = decision
  approval.decidedAt = now()
  const task = state.tasks.find((t) => t.id === approval.taskId)
  const key = task ? taskKey(task) : '작업'
  log('approval', `${key} 실행 요청을 ${decision === 'approved' ? '승인' : '거절'}했습니다.`, {
    taskId: approval.taskId,
    agentId: approval.agentId,
  })
  if (decision === 'rejected') return { approval, error: null }
  try {
    runTask(approval.taskId, 'approval')
    return { approval, error: null }
  } catch (err) {
    return { approval, error: (err as Error).message }
  }
}
