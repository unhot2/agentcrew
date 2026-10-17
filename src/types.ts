import type { RunEvent, RunStatus } from './runTypes'

export type AdapterType = 'claude-code' | 'codex' | 'hermes' | 'lmstudio' | 'ollama'

export type ClaudeCodeConfig = {
  type: 'claude-code'
  model: string
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
}

export type CodexConfig = {
  type: 'codex'
  model: string
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approval: 'untrusted' | 'on-request' | 'never'
}

export type HermesConfig = {
  type: 'hermes'
  /** 비우면 Hermes에 설정된 기본 모델 */
  model: string
  /** 비우면 Hermes에 설정된 기본 공급자 */
  provider: string
  /** 위험 명령 확인을 묻지 않고 실행한다 (--yolo). 끄면 그런 명령은 거절된다 */
  yolo: boolean
  maxTurns: number
}

export type LocalModelConfig = {
  type: 'lmstudio' | 'ollama'
  baseUrl: string
  model: string
  temperature: number
}

export type AdapterConfig = ClaudeCodeConfig | CodexConfig | HermesConfig | LocalModelConfig

export type AgentStatus = 'running' | 'idle' | 'paused' | 'over-budget'

export type Agent = {
  id: string
  name: string
  title: string
  description: string
  reportsTo: string | null
  status: AgentStatus
  workdir: string
  adapter: AdapterConfig
  instructions: string
  heartbeatMinutes: number
  /** 실행 주기마다 배정된 할 일을 스스로 가져가 실행한다 */
  heartbeatEnabled?: boolean
  /** 자동 실행 전에 사람의 승인을 받는다 (bypassPermissions 모드는 항상 승인 필요) */
  requireApproval?: boolean
  skillIds?: string[]
  /** 서버가 기록하는 마지막 하트비트 시각 */
  lastHeartbeatAt?: string
  monthlyBudget: number
  spentThisMonth: number
}

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TaskRun = {
  id: string
  agentId: string
  startedAt: string
  status: RunStatus
  costUsd: number
  events: RunEvent[]
}

export type Task = {
  id: string
  number: number
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  /** 예전에 만든 작업에는 없을 수 있다 */
  projectId?: string | null
  /** 다른 에이전트가 위임해서 만든 작업이면 그 상위 작업 */
  parentTaskId?: string | null
  /** 켜면 담당 에이전트에게 위임 도구를 주지 않아 직접 하게 한다 */
  noDelegation?: boolean
  createdAt: string
  updatedAt: string
  runs: TaskRun[]
}

export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed'

export type Project = {
  id: string
  name: string
  description: string
  status: ProjectStatus
  color: string
  leadAgentId: string | null
  goalId?: string | null
  /** 이 프로젝트 작업을 실행할 폴더 (절대 경로). 비우면 담당 에이전트의 작업 디렉터리 */
  workdir?: string
  createdAt: string
}

export type GoalStatus = 'active' | 'achieved' | 'abandoned'

export type Goal = {
  id: string
  title: string
  description: string
  status: GoalStatus
  targetDate: string
  createdAt: string
}

export type RoutineSchedule =
  | { kind: 'interval'; minutes: number }
  /** days: 0(일)~6(토). 비어 있으면 매일 */
  | { kind: 'daily'; time: string; days: number[] }

export type Routine = {
  id: string
  name: string
  description: string
  assigneeId: string | null
  projectId: string | null
  priority: TaskPriority
  schedule: RoutineSchedule
  enabled: boolean
  /** 작업을 만든 뒤 하트비트를 기다리지 않고 바로 실행한다 */
  runImmediately: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type Approval = {
  id: string
  taskId: string
  agentId: string
  reason: string
  /** 누가 실행을 요청했는지 */
  source: 'heartbeat' | 'routine'
  status: ApprovalStatus
  requestedAt: string
  decidedAt: string | null
}

export type ActivityEntry = {
  id: string
  at: string
  type: string
  message: string
  taskId?: string
  agentId?: string
  projectId?: string
}

export type Artifact = {
  id: string
  path: string
  action: string
  taskId: string
  runId: string
  agentId: string
  at: string
}

export type Skill = {
  id: string
  name: string
  description: string
  content: string
  createdAt: string
}

export type ConnectorType = 'github' | 'slack' | 'webhook'

export type Connector = {
  id: string
  type: ConnectorType
  name: string
  enabled: boolean
  /** github: 토큰, slack/webhook: 주소. 서버는 화면에 일부만 가려서 보낸다 */
  secret: string
  hasSecret?: boolean
  createdAt: string
}

export type Settings = {
  workspaceBase: string
  taskPrefix: string
  /** 하트비트와 반복 업무를 한 번에 멈추는 스위치 */
  automationEnabled: boolean
}
