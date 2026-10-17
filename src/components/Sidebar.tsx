import {
  IconActivity,
  IconBook2,
  IconBuilding,
  IconChecklist,
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
import type { ClaudeCheck } from './AdapterSettings'

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
  | 'office'
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
  office: '오피스',
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
  office: IconBuilding,
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
  { label: '조직', pages: ['agents', 'org', 'office', 'skills', 'approvals'] },
  { label: '시스템', pages: ['activity', 'connectors', 'settings'] },
]

/** 사람이 확인해야 하는 개수는 강조해서 보여준다 */
const ALERT_PAGES = new Set<Page>(['inbox', 'approvals'])

type Props = {
  page: Page
  counts: Partial<Record<Page, number>>
  claudeCheck: ClaudeCheck
  onNavigate: (page: Page) => void
  onNewTask: () => void
}

export function Sidebar({ page, counts, claudeCheck, onNavigate, onNewTask }: Props) {
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
            return (
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
