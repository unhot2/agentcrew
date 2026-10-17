import { useState } from 'react'
import {
  IconActivity,
  IconBook2,
  IconChecklist,
  IconChevronDown,
  IconChevronRight,
  IconFiles,
  IconFolders,
  IconHierarchy2,
  IconInbox,
  IconLayoutDashboard,
  IconPlug,
  IconPlus,
  IconRepeat,
  IconRobot,
  IconSettings,
  IconShieldCheck,
  IconSitemap,
  IconTarget,
} from '@tabler/icons-react'
import { flattenTree } from '../store'
import type { Agent } from '../types'
import type { ClaudeCheck } from './AdapterSettings'
import { STATUS_LABEL } from './AgentList'

export type Page =
  | 'dashboard'
  | 'inbox'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'routines'
  | 'artifacts'
  | 'agents'
  | 'org'
  | 'skills'
  | 'approvals'
  | 'activity'
  | 'connectors'
  | 'settings'

export const PAGE_TITLE: Record<Page, string> = {
  dashboard: '대시보드',
  inbox: '받은 편지함',
  tasks: '작업',
  projects: '프로젝트',
  goals: '목표',
  routines: '반복 업무',
  artifacts: '결과물',
  agents: '에이전트',
  org: '조직도',
  skills: '스킬',
  approvals: '승인',
  activity: '활동 기록',
  connectors: '연결',
  settings: '설정',
}

const ICONS: Record<Page, typeof IconChecklist> = {
  dashboard: IconLayoutDashboard,
  inbox: IconInbox,
  tasks: IconChecklist,
  projects: IconFolders,
  goals: IconTarget,
  routines: IconRepeat,
  artifacts: IconFiles,
  agents: IconRobot,
  org: IconSitemap,
  skills: IconBook2,
  approvals: IconShieldCheck,
  activity: IconActivity,
  connectors: IconPlug,
  settings: IconSettings,
}

export const PAGES = Object.keys(PAGE_TITLE) as Page[]

const GROUPS: { label: string | null; pages: Page[] }[] = [
  { label: null, pages: ['dashboard', 'inbox'] },
  { label: '업무', pages: ['tasks', 'projects', 'goals', 'routines', 'artifacts'] },
  { label: '조직', pages: ['agents', 'org', 'skills', 'approvals'] },
  { label: '시스템', pages: ['activity', 'connectors', 'settings'] },
]

/** 사람이 확인해야 하는 개수는 강조해서 보여준다 */
const ALERT_PAGES = new Set<Page>(['inbox', 'approvals'])

type Props = {
  page: Page
  counts: Partial<Record<Page, number>>
  claudeCheck: ClaudeCheck
  agents: Agent[]
  /** 에이전트 화면에서 열려 있는 에이전트 */
  selectedAgentId: string | null
  onNavigate: (page: Page) => void
  onOpenAgent: (id: string) => void
  onNewTask: () => void
}

const AGENTS_OPEN_KEY = 'agentcrew.nav.agentsOpen'

/** 메뉴의 에이전트 목록을 펼쳤는지 기억한다. 저장소를 못 쓰면 펼친 상태로 시작한다 */
function readAgentsOpen() {
  try {
    return localStorage.getItem(AGENTS_OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

export function Sidebar({ page, counts, claudeCheck, agents, selectedAgentId, onNavigate, onOpenAgent, onNewTask }: Props) {
  const [agentsOpen, setAgentsOpen] = useState(readAgentsOpen)
  const toggleAgents = () => {
    const next = !agentsOpen
    setAgentsOpen(next)
    try {
      localStorage.setItem(AGENTS_OPEN_KEY, next ? '1' : '0')
    } catch {
      // 기억하지 못해도 지금 화면에서는 동작한다
    }
  }
  const ready = claudeCheck.phase === 'done' && claudeCheck.status.installed && claudeCheck.status.loggedIn
  const connectionText =
    claudeCheck.phase === 'checking'
      ? 'Claude Code 확인 중…'
      : ready
        ? 'Claude Code 연결됨'
        : 'Claude Code 연결 안 됨'

  return (
    <nav className="app-nav" aria-label="주 메뉴">
      <div className="brand">
        <IconHierarchy2 size={18} aria-hidden />
        AgentCrew
      </div>
      <button className="new-task" onClick={onNewTask}>
        <IconPlus size={14} aria-hidden /> 새 작업
      </button>
      {GROUPS.map((group) => (
        <div key={group.label ?? 'top'} className="nav-group">
          {group.label && <p className="nav-group-label">{group.label}</p>}
          {group.pages.map((p) => {
            const Icon = ICONS[p]
            const link = (
              <a
                key={p}
                href={`#/${p}`}
                className={`nav-item${page === p ? ' selected' : ''}`}
                aria-current={page === p ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate(p)
                }}
              >
                <Icon size={16} aria-hidden />
                <span>{PAGE_TITLE[p]}</span>
                {!!counts[p] && <span className={`nav-count${ALERT_PAGES.has(p) ? ' alert' : ''}`}>{counts[p]}</span>}
              </a>
            )
            if (p !== 'agents') return link
            // 에이전트 메뉴는 아래에 에이전트 목록을 펼치고 접을 수 있다
            const Chevron = agentsOpen ? IconChevronDown : IconChevronRight
            return (
              <div key={p} className="nav-tree">
                <div className="nav-row">
                  {link}
                  <button
                    className="nav-toggle icon-button"
                    aria-expanded={agentsOpen}
                    aria-controls="nav-agent-list"
                    aria-label={agentsOpen ? '에이전트 목록 접기' : '에이전트 목록 펼치기'}
                    onClick={toggleAgents}
                  >
                    <Chevron size={14} />
                  </button>
                </div>
                {agentsOpen && (
                  <ul id="nav-agent-list" className="nav-sublist">
                    {agents.length === 0 && <li className="nav-subempty">에이전트가 없습니다</li>}
                    {flattenTree(agents).map(({ agent, depth }) => {
                      const current = page === 'agents' && selectedAgentId === agent.id
                      return (
                        <li key={agent.id}>
                          <button
                            className={`nav-subitem${current ? ' selected' : ''}`}
                            style={{ paddingLeft: 10 + depth * 12 }}
                            aria-current={current ? 'page' : undefined}
                            title={`${agent.name} · ${STATUS_LABEL[agent.status]}`}
                            onClick={() => onOpenAgent(agent.id)}
                          >
                            <span className={`dot status-${agent.status}`} aria-hidden />
                            <span className="nav-subname">{agent.name || '이름 없음'}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div className="nav-footer" title={connectionText}>
        <span
          className={`dot ${claudeCheck.phase === 'checking' ? 'status-paused' : ready ? 'status-running' : 'status-over-budget'}`}
        />
        {connectionText}
      </div>
    </nav>
  )
}
