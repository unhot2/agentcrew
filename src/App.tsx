import { useEffect, useState, type ReactNode } from 'react'
import { IconAlertTriangle, IconPlus, IconX } from '@tabler/icons-react'
import { api, onApiError, type ServerState } from './api'
import type { ClaudeCheck } from './components/AdapterSettings'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PAGE_TITLE, PAGES, Sidebar, type Page } from './components/Sidebar'
import { archiveLegacy, readLegacy } from './legacy'
import { ActivityPage } from './pages/ActivityPage'
import { AgentsPage } from './pages/AgentsPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { ArtifactsPage } from './pages/ArtifactsPage'
import { ConnectorsPage } from './pages/ConnectorsPage'
import { DashboardPage } from './pages/DashboardPage'
import { GoalsPage } from './pages/GoalsPage'
import { InboxPage, inboxItems } from './pages/InboxPage'
import { OfficePage } from './pages/OfficePage'
import { OrgChartPage } from './pages/OrgChartPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RoutinesPage } from './pages/RoutinesPage'
import { SettingsPage } from './pages/SettingsPage'
import { SkillsPage } from './pages/SkillsPage'
import { TasksPage } from './pages/TasksPage'
import { createProject } from './projectStore'
import type { ClaudeCodeStatus } from './runTypes'
import { createTask, setTaskPrefix } from './taskStore'
import type { ConnectorType, Task, TaskStatus } from './types'
import { useAgents } from './useAgents'
import { useCollection } from './useCollection'
import { useServerState } from './useServerState'

function pageFromHash(): Page {
  const page = window.location.hash.replace(/^#\//, '') as Page
  return PAGES.includes(page) ? page : 'dashboard'
}

/** 서버에서 데이터를 받아온 뒤 화면을 띄운다. 처음 한 번은 예전 브라우저 데이터를 서버로 옮긴다 */
async function loadState(): Promise<ServerState> {
  const server = await api.state()
  const legacy = readLegacy()
  if (!legacy) return server
  const empty = !server.agents.length && !server.tasks.length && !server.projects.length
  if (!empty) {
    archiveLegacy()
    return server
  }
  const imported = await api.importState(legacy)
  archiveLegacy()
  return imported
}

export default function App() {
  const [state, setState] = useState<ServerState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    loadState()
      .then((s) => {
        setTaskPrefix(s.settings.taskPrefix)
        setState(s)
      })
      .catch(() => setError('서버에서 데이터를 불러오지 못했습니다. npm run dev로 서버를 실행했는지 확인하세요.'))
  }

  useEffect(load, [])

  if (!state) {
    return (
      <div className="loading">
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={load}>다시 시도</button>
          </>
        ) : (
          <p className="muted">불러오는 중…</p>
        )}
      </div>
    )
  }
  return <Workspace initial={state} />
}

const now = () => new Date().toISOString()

function Workspace({ initial }: { initial: ServerState }) {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [claudeCheck, setClaudeCheck] = useState<ClaudeCheck>({ phase: 'checking' })
  const [notice, setNotice] = useState<string | null>(null)
  const [runErrors, setRunErrors] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Partial<Record<Page, string | null>>>({})
  const { data, setData, setList, refresh } = useServerState(initial)

  const agentState = useAgents(data.agents, setList, data.settings)
  const tasks = useCollection('tasks', data.tasks, setList)
  const projects = useCollection('projects', data.projects, setList)
  const goals = useCollection('goals', data.goals, setList)
  const routines = useCollection('routines', data.routines, setList)
  const skills = useCollection('skills', data.skills, setList)
  const connectors = useCollection('connectors', data.connectors, setList)

  useEffect(() => setTaskPrefix(data.settings.taskPrefix), [data.settings.taskPrefix])
  useEffect(() => onApiError((message) => setNotice(`서버에 저장하지 못했습니다: ${message}`)), [])

  const checkClaude = () => {
    setClaudeCheck({ phase: 'checking' })
    fetch('/api/adapters/claude-code/status')
      .then((r) => r.json())
      .then((status: ClaudeCodeStatus) => setClaudeCheck({ phase: 'done', status }))
      .catch(() => setClaudeCheck({ phase: 'offline' }))
  }

  useEffect(checkClaude, [])

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: Page) => {
    if (next === page) return true
    // 에이전트 화면에서 저장하지 않은 편집이 있으면 떠나기 전에 확인한다
    if (page === 'agents' && !agentState.confirmDiscard()) return false
    if (page === 'agents') agentState.cancel()
    window.location.hash = `#/${next}`
    return true
  }

  const select = (p: Page) => (id: string | null) => setSelected((s) => ({ ...s, [p]: id }))
  const open = (p: Page) => (id: string) => {
    if (go(p)) select(p)(id)
  }
  const openAgent = (id: string) => {
    if (go('agents')) agentState.select(id)
  }
  const addAgent = () => {
    if (go('agents')) agentState.add()
  }

  const newTask = (projectId: string | null = null) => {
    if (go('tasks')) select('tasks')(tasks.add({ ...createTask(data.tasks), projectId }, 'start'))
  }
  const newProject = () => select('projects')(projects.add(createProject(data.projects)))
  const newGoal = () =>
    select('goals')(goals.add({ id: crypto.randomUUID(), title: '', description: '', status: 'active', targetDate: '', createdAt: now() }))
  const newSkill = () =>
    select('skills')(skills.add({ id: crypto.randomUUID(), name: '', description: '', content: '', createdAt: now() }))
  // 실수로 바로 돌지 않도록 꺼진 상태로 만든다
  const newRoutine = () =>
    select('routines')(
      routines.add({
        id: crypto.randomUUID(),
        name: '',
        description: '',
        assigneeId: null,
        projectId: null,
        priority: 'medium',
        schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
        enabled: false,
        runImmediately: true,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: now(),
      }),
    )
  const addConnector = (type: ConnectorType) => {
    const names: Record<ConnectorType, string> = { github: 'GitHub', slack: 'Slack', webhook: '웹훅' }
    connectors.add({ id: crypto.randomUUID(), type, name: names[type], enabled: true, secret: '', createdAt: now() })
  }

  const runTask = async (task: Task) => {
    setRunErrors((e) => ({ ...e, [task.id]: '' }))
    try {
      await api.runTask(task.id)
      refresh()
    } catch (err) {
      setRunErrors((e) => ({ ...e, [task.id]: (err as Error).message }))
    }
  }

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const { error } = await api.decide(id, decision)
      if (error) setNotice(`승인했지만 실행하지 못했습니다: ${error}`)
    } catch (err) {
      setNotice((err as Error).message)
    }
    refresh()
  }

  const setTaskStatus = (id: string, status: TaskStatus) => tasks.patch(id, { status }, true)

  const inbox = inboxItems(data)
  const counts: Partial<Record<Page, number>> = {
    inbox: inbox.count,
    tasks: data.tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress' || t.status === 'in_review').length,
    projects: data.projects.filter((p) => p.status === 'active').length,
    goals: data.goals.filter((g) => g.status === 'active').length,
    routines: data.routines.filter((r) => r.enabled).length,
    agents: data.agents.length,
    approvals: inbox.approvals.length,
  }

  const addButton = (label: string, onClick: () => void) => (
    <button onClick={onClick}>
      <IconPlus size={14} aria-hidden /> {label}
    </button>
  )

  const actions: Partial<Record<Page, ReactNode>> = {
    tasks: addButton('새 작업', () => newTask()),
    projects: addButton('새 프로젝트', newProject),
    goals: addButton('새 목표', newGoal),
    routines: addButton('새 반복 업무', newRoutine),
    skills: addButton('새 스킬', newSkill),
    agents: addButton('에이전트 추가', addAgent),
    org: addButton('에이전트 추가', addAgent),
  }

  const pages: Record<Page, () => ReactNode> = {
    dashboard: () => (
      <DashboardPage
        agents={data.agents}
        tasks={data.tasks}
        projects={data.projects}
        pendingApprovals={inbox.approvals.length}
        onOpenTask={open('tasks')}
        onOpenAgent={openAgent}
        onOpenProject={open('projects')}
        onAddAgent={addAgent}
      />
    ),
    inbox: () => (
      <InboxPage
        data={data}
        onOpenTask={open('tasks')}
        onOpenAgent={openAgent}
        onSetTaskStatus={setTaskStatus}
        onRunTask={runTask}
        onDecide={decide}
      />
    ),
    tasks: () => (
      <TasksPage
        tasks={data.tasks}
        agents={data.agents}
        projects={data.projects}
        claudeCheck={claudeCheck}
        runErrors={runErrors}
        selectedId={selected.tasks ?? null}
        onSelect={select('tasks')}
        onAdd={() => newTask()}
        onChange={(id, patch) => tasks.patch(id, patch)}
        onRun={runTask}
        onStop={api.stopRun}
        onDelete={tasks.remove}
      />
    ),
    projects: () => (
      <ProjectsPage
        projects={data.projects}
        tasks={data.tasks}
        agents={data.agents}
        goals={data.goals}
        selectedId={selected.projects ?? null}
        onSelect={select('projects')}
        onAdd={newProject}
        onChange={(id, patch) => projects.patch(id, patch)}
        onDelete={(id) => {
          setList('tasks', (list) => list.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)))
          projects.remove(id)
          select('projects')(null)
        }}
        onOpenTask={open('tasks')}
        onNewTask={newTask}
      />
    ),
    goals: () => (
      <GoalsPage
        data={data}
        selectedId={selected.goals ?? null}
        onSelect={select('goals')}
        onAdd={newGoal}
        onChange={(id, patch) => goals.patch(id, patch)}
        onDelete={(id) => {
          setList('projects', (list) => list.map((p) => (p.goalId === id ? { ...p, goalId: null } : p)))
          goals.remove(id)
        }}
        onOpenProject={open('projects')}
      />
    ),
    routines: () => (
      <RoutinesPage
        data={data}
        selectedId={selected.routines ?? null}
        onSelect={select('routines')}
        onAdd={newRoutine}
        onChange={routines.patch}
        onDelete={routines.remove}
      />
    ),
    artifacts: () => <ArtifactsPage data={data} onOpenTask={open('tasks')} />,
    agents: () => (
      <AgentsPage state={agentState} skills={data.skills} claudeCheck={claudeCheck} onRecheckClaude={checkClaude} />
    ),
    org: () => <OrgChartPage agents={data.agents} tasks={data.tasks} onOpenAgent={openAgent} />,
    office: () => <OfficePage agents={data.agents} tasks={data.tasks} onOpenTask={open('tasks')} onOpenAgent={openAgent} />,
    skills: () => (
      <SkillsPage
        data={data}
        selectedId={selected.skills ?? null}
        onSelect={select('skills')}
        onAdd={newSkill}
        onChange={(id, patch) => skills.patch(id, patch)}
        onDelete={(id) => {
          setList('agents', (list) => list.map((a) => ({ ...a, skillIds: a.skillIds?.filter((s) => s !== id) })))
          skills.remove(id)
        }}
        onOpenAgent={openAgent}
      />
    ),
    approvals: () => <ApprovalsPage data={data} onOpenTask={open('tasks')} onDecide={decide} />,
    activity: () => <ActivityPage data={data} onOpenTask={open('tasks')} onOpenAgent={openAgent} />,
    connectors: () => (
      <ConnectorsPage data={data} onAdd={addConnector} onChange={connectors.patch} onDelete={connectors.remove} />
    ),
    settings: () => <SettingsPage data={data} onSaved={(settings) => setData((d) => ({ ...d, settings }))} />,
  }

  return (
    <div className="app">
      <Sidebar page={page} counts={counts} claudeCheck={claudeCheck} onNavigate={go} onNewTask={() => newTask()} />
      <div className="app-main">
        <header className="topbar">
          <h1 className="page-title">{PAGE_TITLE[page]}</h1>
          {actions[page]}
        </header>
        {!data.settings.automationEnabled && page !== 'settings' && (
          <div className="notice slim">자동 실행이 꺼져 있습니다. 하트비트와 반복 업무가 돌지 않습니다.</div>
        )}
        {notice && (
          <div className="notice error-notice" role="alert">
            <IconAlertTriangle size={16} aria-hidden />
            <span>{notice}</span>
            <button className="icon-button" aria-label="닫기" onClick={() => setNotice(null)}>
              <IconX size={14} />
            </button>
          </div>
        )}
        <ErrorBoundary resetKey={page}>{pages[page]()}</ErrorBoundary>
      </div>
    </div>
  )
}
