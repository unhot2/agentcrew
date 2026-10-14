import { useRef, useState } from 'react'
import type { RunState } from './components/RunPanel'
import type { RunEvent } from './runTypes'
import type { Agent } from './types'

type PatchAgent = (id: string, patch: (a: Agent) => Partial<Agent>) => void

/** 에이전트별 Claude Code 실행 상태. 서버의 SSE 스트림을 받아 쌓는다 */
export function useRuns(patchAgent: PatchAgent) {
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const sources = useRef(new Map<string, EventSource>())

  const update = (agentId: string, fn: (s: RunState) => RunState) =>
    setRuns((r) => ({ ...r, [agentId]: fn(r[agentId] ?? { runId: null, status: 'starting', events: [] }) }))

  const fail = (agentId: string, text: string) =>
    update(agentId, (s) => ({ ...s, status: 'failed', events: [...s.events, { kind: 'error', text }] }))

  const start = async (agent: Agent, prompt: string) => {
    update(agent.id, () => ({ runId: null, status: 'starting', events: [] }))
    let runId: string
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, prompt }),
      })
      const body = await res.json()
      if (!res.ok) return fail(agent.id, body.error ?? '실행하지 못했습니다.')
      runId = body.runId
    } catch {
      return fail(agent.id, '서버에 연결하지 못했습니다. npm run dev로 실행했는지 확인하세요.')
    }

    patchAgent(agent.id, () => ({ status: 'running' }))
    update(agent.id, (s) => ({ ...s, runId, status: 'running' }))

    const source = new EventSource(`/api/runs/${runId}/events`)
    sources.current.set(agent.id, source)
    let finished = false

    source.onmessage = (m) => {
      const e = JSON.parse(m.data) as RunEvent
      update(agent.id, (s) => ({ ...s, events: [...s.events, e] }))
      if (e.kind === 'result') {
        patchAgent(agent.id, (a) => ({ spentThisMonth: a.spentThisMonth + e.costUsd }))
      }
      if (e.kind === 'exit') {
        finished = true
        source.close()
        sources.current.delete(agent.id)
        update(agent.id, (s) => ({ ...s, status: e.status }))
        patchAgent(agent.id, () => ({ status: 'idle' }))
      }
    }

    // 끊기면 자동 재연결 시 이벤트가 처음부터 다시 오므로 재연결하지 않는다
    source.onerror = () => {
      if (finished) return
      source.close()
      sources.current.delete(agent.id)
      fail(agent.id, '실행 로그 연결이 끊겼습니다.')
      patchAgent(agent.id, () => ({ status: 'idle' }))
    }
  }

  const stop = async (agentId: string) => {
    const runId = runs[agentId]?.runId
    if (runId) await fetch(`/api/runs/${runId}/stop`, { method: 'POST' })
  }

  return { runs, start, stop }
}
