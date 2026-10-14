import { useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { adapterLabel } from '../adapters'
import { flattenTree } from '../store'
import type { Agent, AgentStatus } from '../types'

export const STATUS_LABEL: Record<AgentStatus, string> = {
  running: '실행 중',
  idle: '대기',
  paused: '일시 정지',
  'over-budget': '예산 초과',
}

export function initials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/^[A-Za-z]/.test(trimmed)) return trimmed.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
  return trimmed.slice(0, 1)
}

type Props = {
  agents: Agent[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function AgentList({ agents, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = flattenTree(agents)
  const filtered = q
    ? rows.filter(({ agent }) => `${agent.name} ${agent.title}`.toLowerCase().includes(q))
    : rows

  return (
    <aside className="sidebar">
      <label className="search">
        <IconSearch size={14} aria-hidden />
        <input placeholder="에이전트 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className="field-label sidebar-heading">조직</p>
      <ul className="agent-list">
        {filtered.map(({ agent }) => (
          <li key={agent.id}>
            <button
              className={`agent-row${agent.id === selectedId ? ' selected' : ''}`}
              onClick={() => onSelect(agent.id)}
            >
              <span className={`avatar adapter-${agent.adapter.type}`}>{initials(agent.name)}</span>
              <span className="agent-row-text">
                <span className="agent-row-name">{agent.name || '이름 없음'}</span>
                <span className="agent-row-sub">{adapterLabel(agent.adapter.type)}</span>
              </span>
              <span className={`dot status-${agent.status}`} title={STATUS_LABEL[agent.status]} />
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">검색 결과가 없습니다.</li>}
      </ul>
      <div className="legend">
        {(['running', 'idle', 'paused', 'over-budget'] as AgentStatus[]).map((s) => (
          <span key={s}>
            <span className={`dot status-${s}`} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </aside>
  )
}
