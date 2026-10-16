import type { ServerState } from './api'

type LegacyData = Pick<ServerState, 'agents' | 'tasks' | 'projects'>

/** 서버 저장으로 바꾸기 전, 브라우저(localStorage)에 저장하던 키 */
const LEGACY_KEYS = {
  agents: 'agentcrew.agents.v4',
  tasks: 'agentcrew.tasks.v1',
  projects: 'agentcrew.projects.v1',
} as const

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

/** 예전 브라우저 데이터. 하나도 없으면 null */
export function readLegacy(): LegacyData | null {
  const data: LegacyData = {
    agents: read(LEGACY_KEYS.agents),
    tasks: read(LEGACY_KEYS.tasks),
    projects: read(LEGACY_KEYS.projects),
  }
  return data.agents.length || data.tasks.length || data.projects.length ? data : null
}

/** 옮긴 뒤에는 다시 가져오지 않도록 백업 키로 옮겨 둔다 */
export function archiveLegacy() {
  try {
    for (const key of Object.values(LEGACY_KEYS)) {
      const raw = localStorage.getItem(key)
      if (raw !== null) localStorage.setItem(`${key}.migrated`, raw)
      localStorage.removeItem(key)
    }
  } catch {
    // 저장소를 못 쓰면 다음에 다시 시도한다 (서버에 데이터가 있으면 가져오기는 거절된다)
  }
}
