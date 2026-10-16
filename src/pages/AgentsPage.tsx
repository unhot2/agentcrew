import type { ClaudeCheck } from '../components/AdapterSettings'
import { AgentForm } from '../components/AgentForm'
import { AgentList } from '../components/AgentList'
import type { Skill } from '../types'
import type { useAgents } from '../useAgents'

type Props = {
  state: ReturnType<typeof useAgents>
  skills: Skill[]
  claudeCheck: ClaudeCheck
  onRecheckClaude: () => void
}

export function AgentsPage({ state, skills, claudeCheck, onRecheckClaude }: Props) {
  const { agents, listAgents, selectedId, draft, setDraft, dirty, select, add, save, cancel, remove } = state

  return (
    <main className="layout">
      <AgentList agents={listAgents} selectedId={selectedId} onSelect={select} />
      {draft ? (
        <AgentForm
          agents={agents}
          skills={skills}
          draft={draft}
          dirty={dirty}
          onChange={setDraft}
          onSave={save}
          onCancel={cancel}
          onDelete={remove}
          claudeCheck={claudeCheck}
          onRecheckClaude={onRecheckClaude}
        />
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
  )
}
