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
  TaskRun,
} from './types'

export type ServerState = {
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

/** 화면에서 만들고 고칠 수 있는 목록 */
export type EditableKind = 'agents' | 'tasks' | 'projects' | 'goals' | 'routines' | 'skills' | 'connectors'

type ErrorListener = (message: string) => void
const errorListeners = new Set<ErrorListener>()

/** 저장 실패를 화면에 알리고 싶을 때 구독한다 */
export function onApiError(listener: ErrorListener) {
  errorListeners.add(listener)
  return () => {
    errorListeners.delete(listener)
  }
}

async function request<T>(method: string, url: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(url, {
    method,
    keepalive,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `요청이 실패했습니다 (${res.status})`)
  return data as T
}

// 아직 서버에 반영되지 않은 항목. 서버에서 새로 받아올 때 이 항목은 화면 쪽 값을 유지한다
const busy = new Map<string, number>()

export function isBusy(kind: string, id: string) {
  return (busy.get(`${kind}:${id}`) ?? 0) > 0
}

function track<T>(key: string, promise: Promise<T>) {
  busy.set(key, (busy.get(key) ?? 0) + 1)
  promise
    .catch((err: Error) => {
      for (const l of errorListeners) l(err.message)
    })
    .finally(() => {
      const n = (busy.get(key) ?? 1) - 1
      if (n > 0) busy.set(key, n)
      else busy.delete(key)
    })
  return promise
}

// 글자를 칠 때마다 저장하지 않도록 같은 대상의 저장은 마지막 것만 모아서 보낸다
const pending = new Map<string, { url: string; body: unknown; timer: ReturnType<typeof setTimeout>; release: () => void }>()

function flushOne(key: string, keepalive = false) {
  const item = pending.get(key)
  if (!item) return Promise.resolve()
  clearTimeout(item.timer)
  pending.delete(key)
  const p = track(key, request('PUT', item.url, item.body, keepalive))
  item.release()
  return p.then(
    () => undefined,
    () => undefined,
  )
}

function saveLater(key: string, url: string, body: unknown, delay = 300) {
  const prev = pending.get(key)
  if (prev) {
    clearTimeout(prev.timer)
    prev.release()
  }
  // 기다리는 동안에도 서버 값으로 덮이지 않도록 표시해 둔다
  busy.set(key, (busy.get(key) ?? 0) + 1)
  const release = () => {
    const n = (busy.get(key) ?? 1) - 1
    if (n > 0) busy.set(key, n)
    else busy.delete(key)
  }
  pending.set(key, { url, body, timer: setTimeout(() => flushOne(key), delay), release })
}

// 페이지를 닫거나 새로고침할 때 남은 저장을 보낸다
window.addEventListener('pagehide', () => {
  for (const key of [...pending.keys()]) flushOne(key, true)
})

export const api = {
  state: () => request<ServerState>('GET', '/api/state'),
  importState: (data: Partial<ServerState>) => request<ServerState>('POST', '/api/import', data),

  /** 바로 저장한다 (만들기, 저장 버튼) */
  save: (kind: EditableKind, item: { id: string }) => {
    const key = `${kind}:${item.id}`
    pending.get(key)?.release()
    pending.delete(key)
    return track(key, request('PUT', `/api/${kind}/${item.id}`, item))
  },
  /** 입력 중인 내용을 잠시 모았다가 저장한다 */
  saveLater: (kind: EditableKind, item: { id: string }) =>
    saveLater(`${kind}:${item.id}`, `/api/${kind}/${item.id}`, item),
  remove: (kind: EditableKind, id: string) => {
    const key = `${kind}:${id}`
    pending.get(key)?.release()
    pending.delete(key)
    return track(key, request('DELETE', `/api/${kind}/${id}`))
  },

  saveSettings: (settings: Settings) => track('settings:all', request<Settings>('PUT', '/api/settings', settings)),

  /** 실행 전에 아직 안 보낸 편집을 먼저 저장해서 서버가 최신 제목과 담당자로 실행하게 한다 */
  runTask: async (id: string) => {
    await flushOne(`tasks:${id}`)
    return request<TaskRun>('POST', `/api/tasks/${id}/run`, {})
  },
  stopRun: (runId: string) => track(`runs:${runId}`, request('POST', `/api/runs/${runId}/stop`)),
  decide: (id: string, decision: 'approved' | 'rejected', comment = '') =>
    request<{ approval: Approval; error: string | null }>('POST', `/api/approvals/${id}/decide`, { decision, comment }),
  testConnector: (id: string) => request<{ message: string }>('POST', `/api/connectors/${id}/test`, {}),
  artifactContent: (id: string) =>
    request<{ exists: boolean; size: number; content: string; truncated: boolean }>('GET', `/api/artifacts/${id}/content`),
}
