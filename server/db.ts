import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type {
  ActivityEntry,
  Agent,
  Approval,
  Artifact,
  Connector,
  Goal,
  Project,
  Routine,
  Settings,
  Skill,
  Task,
} from '../src/types.ts'

export type State = {
  agents: Agent[]
  tasks: Task[]
  projects: Project[]
  goals: Goal[]
  routines: Routine[]
  approvals: Approval[]
  activity: ActivityEntry[]
  artifacts: Artifact[]
  skills: Skill[]
  connectors: Connector[]
  settings: Settings
}

const DATA_FILE = resolve(process.env.AGENTCREW_DATA ?? 'data/agentcrew.json')
const MAX_ACTIVITY = 1000

export const DEFAULT_SETTINGS: Settings = {
  workspaceBase: 'C:\\Users\\unhot\\Desktop\\workspace',
  taskPrefix: 'AC',
  automationEnabled: true,
}

function load(): State {
  const raw = existsSync(DATA_FILE) ? (JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Partial<State>) : {}
  return {
    agents: raw.agents ?? [],
    tasks: raw.tasks ?? [],
    projects: raw.projects ?? [],
    goals: raw.goals ?? [],
    routines: raw.routines ?? [],
    approvals: raw.approvals ?? [],
    activity: raw.activity ?? [],
    artifacts: raw.artifacts ?? [],
    skills: raw.skills ?? [],
    connectors: raw.connectors ?? [],
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
  }
}

export const state: State = load()

// 서버가 실행 도중 꺼졌다면 그때 실행 중이던 기록은 끝난 것으로 정리한다
let recovered = false
for (const task of state.tasks) {
  for (const run of task.runs) {
    if (run.status !== 'running') continue
    run.status = 'failed'
    run.events.push({ kind: 'error', text: '서버가 재시작되어 실행이 중단됐습니다.' })
    recovered = true
  }
}
for (const agent of state.agents) {
  if (agent.status !== 'running') continue
  agent.status = 'idle'
  recovered = true
}

const changeListeners = new Set<() => void>()

/** 데이터가 바뀌어 저장될 때마다 알림을 받는다 (화면 동기화용) */
export function onChange(listener: () => void) {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

/** 변경 후 호출한다. 실행 로그처럼 잦은 변경은 묶어서 한 번에 쓴다 */
export function persist() {
  if (timer) return
  timer = setTimeout(flush, 200)
}

export function flush() {
  if (timer) clearTimeout(timer)
  timer = null
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  // 쓰는 도중 꺼져도 파일이 깨지지 않게 임시 파일에 쓴 뒤 바꿔치기한다
  const tmp = `${DATA_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, DATA_FILE)
  for (const l of changeListeners) l()
}

if (recovered) flush()

/** 활동 기록을 남긴다. 오래된 것부터 지워 최대 개수를 유지한다 */
export function log(type: string, message: string, refs: Omit<ActivityEntry, 'id' | 'at' | 'type' | 'message'> = {}) {
  state.activity.unshift({ id: randomUUID(), at: new Date().toISOString(), type, message, ...refs })
  if (state.activity.length > MAX_ACTIVITY) state.activity.length = MAX_ACTIVITY
  persist()
}

export function isEmpty() {
  return state.agents.length === 0 && state.tasks.length === 0 && state.projects.length === 0
}

export function dataFilePath() {
  return DATA_FILE
}
