import { defaultAdapterConfig } from './adapters'
import type { Agent } from './types'

const STORAGE_KEY = 'agentcrew.agents.v4'

/** 에이전트 작업 디렉터리 기본값 */
export const WORKSPACE_BASE = 'C:\\Users\\unhot\\Desktop\\workspace'

/** Windows 드라이브 경로(C:\...), UNC 경로(\\server\...), POSIX 절대 경로(/...)만 허용 */
export function isAbsolutePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\/.test(path) || path.startsWith('/')
}


export function loadAgents(): Agent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Agent[]
  } catch {
    // 저장소를 못 읽으면 빈 목록으로 시작
  }
  return []
}

export function saveAgents(agents: Agent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents))
  } catch {
    // 저장 실패는 무시 (시크릿 모드 등)
  }
}

export function createAgent(): Agent {
  const id = crypto.randomUUID()
  return {
    id,
    name: '새 에이전트',
    title: '',
    description: '',
    reportsTo: null,
    status: 'idle',
    workdir: WORKSPACE_BASE,
    adapter: defaultAdapterConfig('claude-code'),
    instructions: '',
    heartbeatMinutes: 30,
    monthlyBudget: 50,
    spentThisMonth: 0,
  }
}

/** id 자신과 그 하위 에이전트 id 전부 (보고 대상 순환 방지용) */
export function descendantIds(agents: Agent[], id: string): Set<string> {
  const result = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const a of agents) {
      if (a.reportsTo && result.has(a.reportsTo) && !result.has(a.id)) {
        result.add(a.id)
        changed = true
      }
    }
  }
  return result
}

/** 보고 체계 순서로 펼친 목록과 깊이 */
export function flattenTree(agents: Agent[]): { agent: Agent; depth: number }[] {
  const ids = new Set(agents.map((a) => a.id))
  const out: { agent: Agent; depth: number }[] = []
  const visit = (parent: string | null, depth: number) => {
    for (const a of agents) {
      const p = a.reportsTo && ids.has(a.reportsTo) ? a.reportsTo : null
      if (p === parent) {
        out.push({ agent: a, depth })
        visit(a.id, depth + 1)
      }
    }
  }
  visit(null, 0)
  return out
}
