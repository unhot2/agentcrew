import { useEffect, useState } from 'react'
import { api, type ServerState } from './api'
import { createAgent } from './store'
import type { Agent } from './types'

type SetList = (kind: 'agents', update: (list: Agent[]) => Agent[]) => void

/** 키 순서와 상관없이 같은 값이면 같은 문자열이 되게 한다 (서버가 돌려준 객체는 키 순서가 다르다) */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** 서버가 관리하는 값(사용 금액, 실행 상태, 하트비트 시각)은 편집 여부 비교에서 뺀다 */
function editable(agent: Agent | null) {
  if (!agent) return 'null'
  const { spentThisMonth: _spent, lastHeartbeatAt: _beat, ...rest } = agent
  return stableStringify({ ...rest, status: agent.status === 'running' ? 'idle' : agent.status })
}

/** 에이전트 목록과 에이전트 화면의 편집 상태. 저장 버튼을 눌러야 서버에 저장한다 */
export function useAgents(agents: Agent[], setList: SetList, settings: ServerState['settings']) {
  const [selectedId, setSelectedId] = useState<string | null>(() => agents[0]?.id ?? null)
  const [draft, setDraft] = useState<Agent | null>(() => agents[0] ?? null)

  const saved = agents.find((a) => a.id === selectedId) ?? null
  // 새로 추가했지만 아직 저장 안 한 에이전트도 변경 사항으로 본다
  const dirty = draft !== null && editable(draft) !== editable(saved)

  // 서버에서 바뀐 사용 금액과 실행 상태는 편집 중인 값에도 반영한다
  useEffect(() => {
    if (!saved) return
    setDraft((d) =>
      d && d.id === saved.id
        ? {
            ...d,
            spentThisMonth: saved.spentThisMonth,
            lastHeartbeatAt: saved.lastHeartbeatAt,
            status: saved.status === 'running' || d.status === 'running' ? saved.status : d.status,
          }
        : d,
    )
  }, [saved?.spentThisMonth, saved?.status, saved?.lastHeartbeatAt])

  const confirmDiscard = () => !dirty || window.confirm('저장하지 않은 변경 사항을 버릴까요?')

  const select = (id: string) => {
    if (id === selectedId || !confirmDiscard()) return
    setSelectedId(id)
    setDraft(agents.find((a) => a.id === id) ?? null)
  }

  const add = () => {
    if (!confirmDiscard()) return
    const agent = createAgent(settings.workspaceBase)
    setSelectedId(agent.id)
    setDraft(agent)
  }

  const save = () => {
    if (!draft) return
    api.save('agents', draft)
    setList('agents', (list) =>
      list.some((a) => a.id === draft.id) ? list.map((a) => (a.id === draft.id ? draft : a)) : [...list, draft],
    )
  }

  const cancel = () => {
    if (saved) setDraft(saved)
    else {
      setSelectedId(agents[0]?.id ?? null)
      setDraft(agents[0] ?? null)
    }
  }

  const remove = () => {
    if (!draft || !window.confirm(`'${draft.name}' 에이전트를 삭제할까요? 하위 에이전트는 상위로 올라갑니다.`)) return
    const next = agents
      .filter((a) => a.id !== draft.id)
      .map((a) => (a.reportsTo === draft.id ? { ...a, reportsTo: draft.reportsTo } : a))
    setList('agents', () => next)
    // 저장 전인 새 에이전트는 서버에 없으므로 지울 것도 없다
    if (agents.some((a) => a.id === draft.id)) api.remove('agents', draft.id)
    setSelectedId(next[0]?.id ?? null)
    setDraft(next[0] ?? null)
  }

  // 목록에는 편집 중인 내용을 바로 반영해서 보여준다
  const listAgents = draft
    ? agents.some((a) => a.id === draft.id)
      ? agents.map((a) => (a.id === draft.id ? draft : a))
      : [...agents, draft]
    : agents

  return {
    agents,
    listAgents,
    selectedId,
    draft,
    setDraft,
    dirty,
    confirmDiscard,
    select,
    add,
    save,
    cancel,
    remove,
  }
}
