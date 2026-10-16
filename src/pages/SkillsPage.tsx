import { IconTrash } from '@tabler/icons-react'
import type { ServerState } from '../api'
import { Field } from '../components/AdapterSettings'
import { EmptyDetail, SimpleList } from '../components/SimpleList'
import type { Skill } from '../types'

type Props = {
  data: ServerState
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onChange: (id: string, patch: Partial<Skill>) => void
  onDelete: (id: string) => void
  onOpenAgent: (id: string) => void
}

export function SkillsPage({ data, selectedId, onSelect, onAdd, onChange, onDelete, onOpenAgent }: Props) {
  const skill = data.skills.find((s) => s.id === selectedId) ?? null
  const usersOf = (id: string) => data.agents.filter((a) => a.skillIds?.includes(id))

  const items = data.skills.map((s) => ({
    id: s.id,
    title: s.name || '이름 없는 스킬',
    sub: `에이전트 ${usersOf(s.id).length}명이 사용`,
  }))

  const remove = (s: Skill) => {
    if (!window.confirm(`스킬 '${s.name || '이름 없음'}'을 삭제할까요? 이 스킬을 쓰던 에이전트에서도 빠집니다.`)) return
    onDelete(s.id)
    onSelect(null)
  }

  return (
    <main className="layout">
      <SimpleList items={items} selectedId={selectedId} empty="스킬이 없습니다." onSelect={onSelect} />
      {skill ? (
        <section className="detail" key={skill.id}>
          <header className="detail-header">
            <div className="task-title-wrap">
              <span className="task-key">스킬</span>
              <input
                className="task-title"
                value={skill.name}
                placeholder="스킬 이름"
                aria-label="스킬 이름"
                onChange={(e) => onChange(skill.id, { name: e.target.value })}
              />
            </div>
            <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={() => remove(skill)}>
              <IconTrash size={16} />
            </button>
          </header>
          <div className="section">
            <Field label="한 줄 설명">
              <input
                value={skill.description}
                placeholder="코드 리뷰 체크리스트"
                onChange={(e) => onChange(skill.id, { description: e.target.value })}
              />
            </Field>
            <Field label="내용" hint="이 스킬을 쓰는 에이전트는 실행할 때마다 지시문 뒤에 이 내용을 함께 받습니다.">
              <textarea
                className="mono"
                rows={14}
                value={skill.content}
                placeholder={'예: 커밋 메시지 규칙\n- 한국어로 쓴다\n- 첫 줄은 50자 이내로 쓴다'}
                onChange={(e) => onChange(skill.id, { content: e.target.value })}
              />
            </Field>
          </div>
          <div className="section">
            <h2>이 스킬을 쓰는 에이전트</h2>
            <ul className="row-list">
              {usersOf(skill.id).map((a) => (
                <li key={a.id}>
                  <button className="row-link" onClick={() => onOpenAgent(a.id)}>
                    <span className="row-link-title">{a.name}</span>
                    <span className="muted">{a.title}</span>
                  </button>
                </li>
              ))}
              {usersOf(skill.id).length === 0 && <li className="empty">에이전트 설정의 스킬 칸에서 이 스킬을 고르세요.</li>}
            </ul>
          </div>
        </section>
      ) : (
        <EmptyDetail
          title={data.skills.length ? '스킬을 선택하세요' : '첫 스킬을 만들어 보세요'}
          body="여러 에이전트가 같이 쓰는 작업 방법이나 규칙을 한 곳에 적어 두고, 에이전트마다 골라 붙입니다."
          action="새 스킬"
          onAction={onAdd}
        />
      )}
    </main>
  )
}
