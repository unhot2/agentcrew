import { useEffect, useState } from 'react'
import { IconHierarchy2, IconPlus } from '@tabler/icons-react'
import { AgentForm } from './components/AgentForm'
import { AgentList } from './components/AgentList'
import { RunPanel } from './components/RunPanel'
import { createAgent, loadAgents, saveAgents } from './store'
import type { ClaudeCheck } from './components/AdapterSettings'
import type { ClaudeCodeStatus } from './runTypes'
import type { Agent } from './types'
import { useRuns } from './useRuns'

export default function App() {
  const [agents, setAgents] = useState<Agent[]>(loadAgents)
  const [selectedId, setSelectedId] = useState<string | null>(() => agents[0]?.id ?? null)
  const [draft, setDraft] = useState<Agent | null>(() => agents[0] ?? null)

  const [claudeCheck, setClaudeCheck] = useState<ClaudeCheck>({ phase: 'checking' })

  useEffect(() => saveAgents(agents), [agents])

  const checkClaude = () => {
    setClaudeCheck({ phase: 'checking' })
    fetch('/api/adapters/claude-code/status')
      .then((r) => r.json())
      .then((status: ClaudeCodeStatus) => setClaudeCheck({ phase: 'done', status }))
      .catch(() => setClaudeCheck({ phase: 'offline' }))
  }

  useEffect(checkClaude, [])

  // 실행 결과(상태, 사용 비용)는 저장본과 편집본에 똑같이 반영해서 변경 사항으로 잡히지 않게 한다
  const patchAgent = (id: string, patch: (a: Agent) => Partial<Agent>) => {
    setAgents((list) => list.map((a) => (a.id === id ? { ...a, ...patch(a) } : a)))
    setDraft((d) => (d && d.id === id ? { ...d, ...patch(d) } : d))
  }
  const { runs, start, stop } = useRuns(patchAgent)

  const saved = agents.find((a) => a.id === selectedId) ?? null
  // 새로 추가했지만 아직 저장 안 한 에이전트도 변경 사항으로 본다
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  const confirmDiscard = () => !dirty || window.confirm('저장하지 않은 변경 사항을 버릴까요?')

  const select = (id: string) => {
    if (id === selectedId || !confirmDiscard()) return
    setSelectedId(id)
    setDraft(agents.find((a) => a.id === id) ?? null)
  }

  const add = () => {
    if (!confirmDiscard()) return
    const agent = createAgent()
    setSelectedId(agent.id)
    setDraft(agent)
  }

  const save = () => {
    if (!draft) return
    setAgents((list) =>
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
    setAgents(next)
    setSelectedId(next[0]?.id ?? null)
    setDraft(next[0] ?? null)
  }

  const runBlockedReason = (): string | null => {
    if (!draft) return null
    if (draft.adapter.type !== 'claude-code') return '아직 Claude Code 어댑터만 실행할 수 있습니다.'
    if (claudeCheck.phase === 'checking') return 'Claude Code 연결 상태를 확인하는 중입니다.'
    if (claudeCheck.phase === 'offline') return '서버에 연결하지 못했습니다. npm run dev로 실행하세요.'
    if (!claudeCheck.status.installed) return 'Claude Code CLI(claude)를 찾을 수 없습니다.'
    if (!claudeCheck.status.loggedIn) return 'Claude Code에 로그인되어 있지 않습니다.'
    if (!saved || dirty) return '설정을 저장한 뒤 실행할 수 있습니다.'
    if (saved.monthlyBudget > 0 && saved.spentThisMonth >= saved.monthlyBudget) return '이번 달 예산을 모두 썼습니다.'
    return null
  }

  // 목록에는 편집 중인 내용을 바로 반영해서 보여준다
  const listAgents = draft
    ? agents.some((a) => a.id === draft.id)
      ? agents.map((a) => (a.id === draft.id ? draft : a))
      : [...agents, draft]
    : agents

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <IconHierarchy2 size={18} aria-hidden />
          AgentCrew
          <span className="muted">/ 에이전트</span>
        </div>
        <button onClick={add}>
          <IconPlus size={14} aria-hidden /> 에이전트 추가
        </button>
      </header>
      <main className="layout">
        <AgentList agents={listAgents} selectedId={selectedId} onSelect={select} />
        {draft ? (
          <AgentForm
            agents={agents}
            draft={draft}
            dirty={dirty}
            onChange={setDraft}
            onSave={save}
            onCancel={cancel}
            onDelete={remove}
            claudeCheck={claudeCheck}
            onRecheckClaude={checkClaude}
          >
            <RunPanel
              run={runs[draft.id]}
              blockedReason={runBlockedReason()}
              onRun={(prompt) => saved && start(saved, prompt)}
              onStop={() => stop(draft.id)}
            />
          </AgentForm>
        ) : (
          <section className="detail empty-state">
            <h1>첫 에이전트를 만들어 보세요</h1>
            <p className="muted">에이전트마다 어댑터, 지시문, 실행 주기, 예산을 설정할 수 있습니다.</p>
            <button className="primary" onClick={add}>
              에이전트 추가
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
