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
  RunSource,
} from '../src/types.ts'
import type { RunEvent } from '../src/runTypes.ts'
import { setTaskPrefix, taskKey, taskPrompt } from '../src/taskStore.ts'
import {
  APPROVAL_GUIDE,
  DELEGATION_GUIDE,
  NO_DELEGATION_GUIDE,
  hasTeam,
  issueGrant,
  lastResult,
  revokeGrant,
} from './delegation.ts'
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
const TASK_FIELDS: (keyof Task)[] = ['title', 'description', 'status', 'priority', 'assigneeId', 'projectId', 'noDelegation', 'reportSignedAt']
const PROJECT_FIELDS: (keyof Project)[] = ['name', 'description', 'status', 'color', 'leadAgentId', 'goalId', 'workdir']
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
const ADAPTER_TYPES = new Set(['claude-code', 'codex', 'hermes', 'lmstudio', 'ollama'])

export function putAgent(id: string, body: Agent) {
  const existing = state.agents.find((a) => a.id === id)
  // 어댑터가 없거나 모르는 종류면 화면이 그릴 수 없으므로 받지 않는다
  if ((!existing || 'adapter' in body) && !ADAPTER_TYPES.has(body.adapter?.type)) {
    throw new ApiError(400, '어댑터 정보가 올바르지 않습니다.')
  }
  if (!existing && (typeof body.name !== 'string' || typeof body.workdir !== 'string')) {
    throw new ApiError(400, '이름과 작업 디렉터리가 필요합니다.')
  }
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
      if (existing.status === 'done' || existing.status === 'cancelled') continueParentOf(existing)
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
  // 입력 중에도 저장되므로 경로 검사는 실행할 때 한다
  if (typeof body.workdir === 'string') body.workdir = body.workdir.trim()
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

export type { RunSource }

const SOURCE_LABEL: Record<RunSource, string> = {
  manual: '직접 실행',
  heartbeat: '하트비트',
  routine: '반복 업무',
  approval: '승인 후 실행',
  subtasks: '하위 작업 완료 후 실행',
}

/** 에이전트 도구(MCP나 함수 호출)를 쓸 수 있는 어댑터. Hermes는 도구를 붙일 수 없다 */
const TOOL_ADAPTERS = new Set<Agent['adapter']['type']>(['claude-code', 'codex', 'lmstudio', 'ollama'])

/**
 * 에이전트 지시문 뒤에 배정된 스킬 내용과, 팀이 있으면 위임 안내(위임 금지면 직접 하라는 안내),
 * 도구를 쓸 수 있으면 승인 요청 안내를 붙인다
 */
function systemPromptFor(agent: Agent, delegation: 'allowed' | 'forbidden' | null, canRequestApproval: boolean) {
  const parts = [agent.instructions.trim()]
  for (const id of agent.skillIds ?? []) {
    const skill = state.skills.find((s) => s.id === id)
    if (skill?.content.trim()) parts.push(`## 스킬: ${skill.name}\n${skill.content.trim()}`)
  }
  if (delegation === 'allowed') parts.push(DELEGATION_GUIDE)
  if (delegation === 'forbidden') parts.push(NO_DELEGATION_GUIDE)
  if (canRequestApproval) parts.push(APPROVAL_GUIDE)
  return parts.filter(Boolean).join('\n\n')
}

/** 이 작업을 이 에이전트가 마지막으로 실행한 Claude Code 세션 */
function lastSessionId(task: Task, agentId: string) {
  for (const run of [...task.runs].reverse()) {
    if (run.agentId !== agentId) continue
    const init = run.events.find((e) => e.kind === 'init')
    if (init && init.kind === 'init' && init.sessionId) return init.sessionId
  }
  return undefined
}

/** 이 세션의 마지막 실행이 알려 준 누적 비용. 예전 기록은 costUsd에 누적 비용이 그대로 들어 있다 */
function sessionCostSoFar(task: Task, sessionId: string) {
  for (const run of [...task.runs].reverse()) {
    const init = run.events.find((e) => e.kind === 'init')
    if (!init || init.kind !== 'init' || init.sessionId !== sessionId) continue
    const result = [...run.events].reverse().find((e) => e.kind === 'result')
    if (result && result.kind === 'result') return result.sessionCostUsd ?? result.costUsd
  }
  return 0
}

/**
 * 작업을 담당 에이전트로 실행하고, 실행 로그, 비용, 결과물을 작업과 에이전트에 기록한다.
 * followUp을 주면 앞 실행에 이어서 진행한다 (Claude Code는 같은 세션을 잇고, 다른 어댑터는 앞 결과를 함께 넘긴다)
 */
export function runTask(taskId: string, source: RunSource = 'manual', followUp?: string): TaskRun {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) throw new ApiError(404, '작업을 찾을 수 없습니다.')
  // 제목 없이 설명만 적었으면 설명 첫 줄을 제목으로 쓴다. 실제로 실행할 때만 저장한다
  const firstLine = task.description.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const title = task.title.trim() || (firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine)
  if (!title) throw new ApiError(400, '제목이나 설명을 입력하세요.')
  const agent = state.agents.find((a) => a.id === task.assigneeId)
  if (!agent) throw new ApiError(400, '담당 에이전트를 지정하세요.')
  if (agent.status === 'paused') throw new ApiError(400, '담당 에이전트가 일시 정지 상태입니다.')
  const project = state.projects.find((p) => p.id === task.projectId)
  // 프로젝트에 작업 폴더가 있으면 에이전트 폴더 대신 그 폴더에서 실행한다
  if (project?.workdir && !isAbsolute(project.workdir)) throw new ApiError(400, '프로젝트 작업 폴더는 절대 경로로 입력하세요.')
  const runner = project?.workdir ? { ...agent, workdir: project.workdir } : agent
  const goal = state.goals.find((g) => g.id === project?.goalId)
  const parent = state.tasks.find((t) => t.id === task.parentTaskId)
  const delegator = state.agents.find((a) => a.id === parent?.assigneeId)?.name
  const basePrompt = taskPrompt({ ...task, title }, { project, goal, parent, delegator })
  const resumeSessionId = followUp && agent.adapter.type === 'claude-code' ? lastSessionId(task, agent.id) : undefined
  const resumeBaseCostUsd = resumeSessionId ? sessionCostSoFar(task, resumeSessionId) : undefined
  const previous = followUp && !resumeSessionId ? lastResult(task, 3000) : ''
  const prompt = !followUp
    ? basePrompt
    : resumeSessionId
      ? followUp
      : [basePrompt, previous && `## 이전 실행 결과\n${previous}`, followUp].filter(Boolean).join('\n\n')
  const error = validate(runner, prompt)
  if (error) throw new ApiError(400, error)
  if (task.title !== title) task.title = title

  const key = taskKey(task)
  const taskRun: TaskRun = {
    id: '',
    agentId: agent.id,
    source,
    startedAt: now(),
    status: 'running',
    costUsd: 0,
    events: [],
  }

  const onEvent = (e: RunEvent) => {
    taskRun.events.push(e)
    const owner = state.agents.find((a) => a.id === agent.id)
    if (e.kind === 'tool' && e.path) {
      const path = isAbsolute(e.path) ? e.path : resolve(runner.workdir, e.path)
      const already = state.artifacts.some((a) => a.runId === taskRun.id && a.path === path)
      if (!already) {
        state.artifacts.unshift({ id: randomUUID(), path, action: e.name, taskId, runId: taskRun.id, agentId: agent.id, at: now() })
      }
    }
    if (e.kind === 'result') {
      // 한 실행에서 결과가 여러 번 오면 마지막 값만 남기고, 에이전트 사용액에는 늘어난 만큼만 더한다
      if (owner) owner.spentThisMonth += e.costUsd - taskRun.costUsd
      taskRun.costUsd = e.costUsd
    }
    if (e.kind === 'exit') {
      if (agentTools) revokeGrant(agentTools.token)
      taskRun.status = e.status
      const current = state.tasks.find((t) => t.id === taskId)
      // 하위 작업에 맡겨 둔 일이 남아 있으면 진행 중으로 두고, 끝나면 이어서 실행한다
      let resumeNow = false
      if (current && e.status === 'completed' && current.status === 'in_progress') {
        const children = subtasksOf(current)
        if (children.some((c) => !subtaskFinished(c))) {
          log('task', `${key}은 맡긴 하위 작업이 끝나면 이어서 진행합니다.`, { taskId, agentId: agent.id })
        } else if (children.some((c) => c.updatedAt >= taskRun.startedAt)) {
          // 이 실행 중에 맡긴 하위 작업이 벌써 끝났으면 바로 이어서 진행한다
          resumeNow = true
        } else {
          current.status = 'in_review'
          current.updatedAt = now()
        }
      }
      if (owner && owner.status === 'running') owner.status = 'idle'
      const result = { completed: '완료', failed: '실패', stopped: '중지', running: '실행 중' }[e.status]
      log('run', `${agent.name}의 ${key} 실행이 ${result}됐습니다. ($${taskRun.costUsd.toFixed(2)})`, {
        taskId,
        agentId: agent.id,
      })
      notify(`run.${e.status}`, `${agent.name}: ${key} ${task.title} 실행 ${result}`, { taskId, agentId: agent.id })
      // 실행 기록이 다 정리된 뒤에 다음 실행을 시작한다
      if (current && e.status === 'completed') {
        setTimeout(() => {
          if (resumeNow) continueAfterSubtasks(current)
          continueParentOf(current)
        })
      }
    }
    persist()
  }

  // 도구를 붙일 수 있으면 승인 요청 도구를 주고, 팀이 있고 작업에서 위임을 막지 않았으면 위임 도구도 준다.
  // 토큰은 이 실행이 끝나면 버린다
  const team = hasTeam(agent.id)
  const canDelegate = team && !task.noDelegation && TOOL_ADAPTERS.has(agent.adapter.type)
  const agentTools = TOOL_ADAPTERS.has(agent.adapter.type) ? issueGrant({ runId: '', agentId: agent.id, taskId, canDelegate }) : null
  const guide = !team ? null : canDelegate ? 'allowed' : 'forbidden'
  const systemPrompt = systemPromptFor(agent, guide, !!agentTools)
  // 이벤트는 모두 비동기로 오므로 id를 바로 채워 넣어도 순서가 꼬이지 않는다
  const run = startRun(runner, prompt, onEvent, {
    systemPrompt,
    env: connectorEnv(),
    agentTools,
    resumeSessionId,
    resumeBaseCostUsd,
  })
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

// ---------- 하위 작업이 끝난 뒤 이어서 진행 ----------

function subtasksOf(task: Task) {
  return state.tasks.filter((t) => t.parentTaskId === task.id)
}

/** 하위 작업이 끝났는지. 실행을 마쳐 검토 대기로 올라온 것도 끝난 것으로 본다 (검증은 상위 담당자가 한다) */
function subtaskFinished(task: Task) {
  const settled = task.status === 'done' || task.status === 'cancelled' || task.status === 'in_review'
  return settled && !task.runs.some((r) => r.status === 'running')
}

/** 하위 작업을 맡겨 두고 결과를 기다리는 작업인지 */
function waitingForSubtasks(task: Task) {
  if (task.status !== 'in_progress' || task.runs.length === 0) return false
  if (task.runs.some((r) => r.status === 'running')) return false
  const children = subtasksOf(task)
  return children.length > 0 && children.every(subtaskFinished)
}

/** 하위 작업 결과를 상위 담당자에게 넘기는 글 */
function subtasksFollowUp(task: Task) {
  const lines = subtasksOf(task).map((c) => {
    const who = state.agents.find((a) => a.id === c.assigneeId)?.name ?? '담당 없음'
    const result = lastResult(c, 1500)
    const body = result ? `- 결과:\n${result}` : '- 결과: (남긴 요약 없음)'
    return `### [${taskKey(c)}] ${c.title}\n- 담당: ${who} · 상태: ${c.status}\n${body}`
  })
  return [
    '## 하위 작업 결과',
    '맡긴 하위 작업이 모두 끝났습니다. 각 작업의 결과는 아래와 같습니다.',
    ...lines,
    '결과를 검증하고, 필요한 정리나 병합을 직접 마친 뒤 이 작업의 최종 결과를 보고하세요.',
    '고칠 점이 있으면 create_task로 다시 맡기세요. 그 작업이 끝나면 다시 이어서 실행됩니다.',
  ].join('\n\n')
}

/** 하위 작업이 모두 끝난 작업을 담당 에이전트가 이어서 진행하게 한다. 실행하지 못하면 다음 차례에 다시 시도한다 */
export function continueAfterSubtasks(task: Task) {
  if (task.status === 'done' || task.status === 'cancelled') return
  if (task.runs.some((r) => r.status === 'running')) return
  try {
    runTask(task.id, 'subtasks', subtasksFollowUp(task))
    stuckParents.delete(task.id)
  } catch (err) {
    // 담당 에이전트가 다른 일을 하는 중이면 진행 중으로 두고 스케줄러가 다시 시도한다
    if (task.status !== 'in_progress') {
      task.status = 'in_progress'
      task.updatedAt = now()
    }
    // 같은 이유로 계속 실패해도 기록은 한 번만 남긴다
    const message = (err as Error).message
    if (stuckParents.get(task.id) !== message) {
      stuckParents.set(task.id, message)
      log('task', `${taskKey(task)}의 하위 작업이 끝났지만 아직 이어서 실행하지 못했습니다: ${message}`, { taskId: task.id })
    }
    persist()
  }
}

/** 이어서 실행하지 못한 작업과 그 이유 (같은 기록을 반복해서 남기지 않으려고) */
const stuckParents = new Map<string, string>()

/** 하위 작업이 끝났을 때 상위 작업이 기다리던 마지막 결과면 상위 담당자를 깨운다 */
export function continueParentOf(task: Task) {
  const parent = state.tasks.find((t) => t.id === task.parentTaskId)
  if (!parent || !waitingForSubtasks(parent)) return
  log('task', `${taskKey(parent)}의 하위 작업이 모두 끝났습니다. 담당 에이전트가 결과를 정리합니다.`, { taskId: parent.id })
  notify('task.subtasks_done', `${taskKey(parent)} ${parent.title}: 하위 작업 완료`, { taskId: parent.id })
  continueAfterSubtasks(parent)
}

/** 스케줄러가 부른다. 담당자가 바빠서 이어가지 못한 작업을 다시 시도한다 */
export function retryWaitingParents() {
  for (const task of state.tasks) {
    if (!waitingForSubtasks(task)) continue
    const agent = state.agents.find((a) => a.id === task.assigneeId)
    if (!agent || agent.status !== 'idle') continue
    continueAfterSubtasks(task)
  }
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

/** 승인 결과를 에이전트에게 전하는 글. 반려에 코멘트가 없으면 이어서 실행하지 않으므로 null */
function approvalFollowUp(approval: Approval) {
  const comment = approval.comment ? `\n코멘트: ${approval.comment}` : ''
  if (approval.status === 'approved')
    return `## 승인 결과\n사람이 "${approval.reason}" 요청을 승인했습니다.${comment}\n승인된 내용으로 다음 단계를 이어서 진행하세요.`
  if (!approval.comment) return null
  return `## 승인 결과\n사람이 "${approval.reason}" 요청을 반려했습니다.${comment}\n코멘트를 반영해 고친 뒤, 다시 request_approval로 승인을 요청하세요.`
}

/**
 * 실행 전 승인은 승인하면 바로 실행한다. 에이전트가 올린 승인은 결과와 코멘트를 넘겨 이어서 실행한다
 * (반려에 코멘트가 있으면 코멘트를 반영해 고치게 한다). 실행이 거절되면 승인은 남기고 이유를 돌려준다
 */
export function decideApproval(id: string, decision: 'approved' | 'rejected', comment = '') {
  const approval = state.approvals.find((a) => a.id === id)
  if (!approval) throw new ApiError(404, '승인 요청을 찾을 수 없습니다.')
  if (approval.status !== 'pending') throw new ApiError(409, '이미 처리한 요청입니다.')
  approval.status = decision
  approval.decidedAt = now()
  if (comment.trim()) approval.comment = comment.trim()
  const task = state.tasks.find((t) => t.id === approval.taskId)
  const key = task ? taskKey(task) : '작업'
  const what = approval.source === 'agent' ? `"${approval.reason}" 요청` : '실행 요청'
  log('approval', `${key} ${what}을 ${decision === 'approved' ? '승인' : '거절'}했습니다.`, {
    taskId: approval.taskId,
    agentId: approval.agentId,
  })
  persist()
  const followUp = approval.source === 'agent' ? approvalFollowUp(approval) : undefined
  if (followUp === null || (decision === 'rejected' && approval.source !== 'agent')) return { approval, error: null }
  try {
    runTask(approval.taskId, 'approval', followUp)
    return { approval, error: null }
  } catch (err) {
    return { approval, error: (err as Error).message }
  }
}
