import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Agent, Task, TaskPriority } from '../src/types.ts'
import { bracketTaskKeys, taskKey } from '../src/taskStore.ts'
import { log, persist, state } from './db.ts'
import { notify } from './notify.ts'

/** 에이전트 도구(MCP 서버)가 부를 서버 주소. 서버가 뜰 때 정한다 */
let apiUrl = 'http://127.0.0.1:5180'

export function setApiUrl(url: string) {
  apiUrl = url
}

type Grant = { runId: string; agentId: string; taskId: string; canDelegate: boolean }

/** 실행 중에만 유효한 토큰. 에이전트는 이 토큰으로 승인을 요청하고, 팀이 있으면 자기 팀에만 일을 맡길 수 있다 */
const grants = new Map<string, Grant>()

export function issueGrant(grant: Grant) {
  const token = randomUUID()
  grants.set(token, grant)
  return { token, apiUrl, tools: toolsFor(grant).map((t) => t.function.name) }
}

/** 이 실행에서 쓸 수 있는 도구. 승인 요청은 누구나, 위임 도구는 위임할 수 있을 때만 */
function toolsFor(grant: Grant) {
  return grant.canDelegate ? [...DELEGATION_TOOLS, APPROVAL_TOOL] : [APPROVAL_TOOL]
}

export function agentTools(token: string) {
  const grant = grants.get(token)
  return grant ? toolsFor(grant) : []
}

export function revokeGrant(token: string) {
  grants.delete(token)
}

/** 에이전트 아래에 있는 모든 에이전트 (직속 + 그 아래) */
export function descendantsOf(agentId: string): Agent[] {
  const out: Agent[] = []
  const queue = [agentId]
  while (queue.length) {
    const id = queue.shift()!
    for (const a of state.agents) {
      if (a.reportsTo === id && !out.includes(a)) {
        out.push(a)
        queue.push(a.id)
      }
    }
  }
  return out
}

export function hasTeam(agentId: string) {
  return state.agents.some((a) => a.reportsTo === agentId)
}

/** 에이전트에게 주는 위임 도구 (OpenAI 함수 호출 형식, MCP 서버도 이 정의를 그대로 쓴다) */
export const DELEGATION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_team',
      description: '나에게 보고하는 하위 에이전트 목록과 역할, 지금 맡은 일의 수를 본다.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description:
        '하위 에이전트에게 작업을 맡긴다. 지금 작업의 하위 작업으로 만들어지고, 담당 에이전트가 자기 차례에 실행한다.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '작업 제목' },
          description: { type: 'string', description: '무엇을 어떻게 할지, 완료 기준까지 자세히' },
          assignee_id: { type: 'string', description: 'list_team으로 확인한 하위 에이전트 id' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        },
        required: ['title', 'description', 'assignee_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_subtasks',
      description: '지금 작업에서 맡긴 하위 작업들의 상태와 마지막 실행 결과를 본다.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

/** 사람의 확인이 필요할 때 승인 메뉴에 요청을 올리는 도구. 위임과 상관없이 모든 에이전트가 쓴다 */
const APPROVAL_TOOL = {
  type: 'function' as const,
  function: {
    name: 'request_approval',
    description:
      '사람의 확인이나 결정이 필요할 때 승인 메뉴에 승인 요청을 올린다. 승인되면 이 작업이 다시 실행되어 이어서 진행한다.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '무엇을 승인받는지 한 줄로 (예: 메인 화면 디자인 초안)' },
        details: {
          type: 'string',
          description: '확인할 내용, 결과물 파일 위치, 고를 선택지, 승인되면 다음에 할 일을 자세히',
        },
      },
      required: ['title', 'details'],
    },
  },
}

export const AGENT_TOOL_NAMES = [...DELEGATION_TOOLS, APPROVAL_TOOL].map((t) => t.function.name)

const PRIORITIES = new Set<TaskPriority>(['urgent', 'high', 'medium', 'low'])

function openCount(agentId: string) {
  return state.tasks.filter(
    (t) => t.assigneeId === agentId && (t.status === 'todo' || t.status === 'in_progress' || t.status === 'in_review'),
  ).length
}

export function lastResult(task: Task, max = 600) {
  const events = task.runs[task.runs.length - 1]?.events ?? []
  const result = [...events].reverse().find((e) => e.kind === 'result')
  return result && result.kind === 'result' ? result.text.slice(0, max) : ''
}

/** 에이전트 도구 실행. 토큰으로 누가 어떤 작업에서 부르는지 확인한다 */
export async function callAgentTool(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const grant = grants.get(token)
  if (!grant) return { text: '이 실행의 권한이 끝났습니다.', isError: true }
  const agent = state.agents.find((a) => a.id === grant.agentId)
  const parent = state.tasks.find((t) => t.id === grant.taskId)
  if (!agent || !parent) return { text: '에이전트나 작업을 찾을 수 없습니다.', isError: true }

  if (name === 'request_approval') {
    const title = String(args.title ?? '').trim()
    const details = String(args.details ?? '').trim()
    if (!title) return { text: '무엇을 승인받는지 title에 적으세요.', isError: true }
    // 같은 작업에 기다리는 요청이 있으면 새로 만들지 않고 내용을 바꾼다
    const existing = state.approvals.find((a) => a.taskId === parent.id && a.status === 'pending')
    if (existing) Object.assign(existing, { reason: title, details, source: 'agent', requestedAt: new Date().toISOString() })
    else {
      state.approvals.unshift({
        id: randomUUID(),
        taskId: parent.id,
        agentId: agent.id,
        reason: title,
        details,
        source: 'agent',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        decidedAt: null,
      })
    }
    log('approval', `${agent.name}가 ${taskKey(parent)}에서 승인을 요청했습니다: ${title}`, { taskId: parent.id, agentId: agent.id })
    notify('approval.requested', `${agent.name}: ${taskKey(parent)} ${title} 승인 요청`, { taskId: parent.id })
    persist()
    return {
      text: '승인 메뉴에 요청을 올렸습니다. 승인 전에 해야 할 일은 더 하지 말고, 지금까지 한 일을 요약하고 끝내세요. 승인되면 이 작업이 다시 실행됩니다.',
      isError: false,
    }
  }

  if (!grant.canDelegate) return { text: `이 실행에서는 쓸 수 없는 도구입니다: ${name}`, isError: true }
  const team = descendantsOf(agent.id)

  if (name === 'list_team') {
    if (team.length === 0) return { text: '하위 에이전트가 없습니다.', isError: false }
    const lines = team.map((a) => {
      const boss = a.reportsTo === agent.id ? '직속' : `${state.agents.find((x) => x.id === a.reportsTo)?.name ?? ''} 아래`
      const auto = a.heartbeatEnabled ? '자동 실행 켜짐' : '자동 실행 꺼짐(사람이 실행해야 함)'
      return `- id: ${a.id} | ${a.name} (${a.title || '직책 없음'}, ${boss}) | ${a.description || '설명 없음'} | 맡은 일 ${openCount(a.id)}개 | ${auto}`
    })
    return { text: lines.join('\n'), isError: false }
  }

  if (name === 'create_task') {
    // 에이전트가 제목 앞에 붙이는 상위 작업 번호는 [AC-10]처럼 묶는다
    const title = bracketTaskKeys(String(args.title ?? '').trim())
    const description = String(args.description ?? '').trim()
    const assignee = team.find((a) => a.id === String(args.assignee_id ?? ''))
    if (!title) return { text: '제목이 필요합니다.', isError: true }
    if (!assignee) return { text: '하위 에이전트에게만 맡길 수 있습니다. list_team으로 id를 확인하세요.', isError: true }
    const priority = PRIORITIES.has(args.priority as TaskPriority) ? (args.priority as TaskPriority) : parent.priority
    const now = new Date().toISOString()
    const task: Task = {
      id: randomUUID(),
      number: Math.max(0, ...state.tasks.map((t) => t.number)) + 1,
      title,
      description,
      status: 'todo',
      priority,
      assigneeId: assignee.id,
      projectId: parent.projectId ?? null,
      parentTaskId: parent.id,
      createdAt: now,
      updatedAt: now,
      runs: [],
    }
    state.tasks.unshift(task)
    // 담당 에이전트가 다음 하트비트를 기다리지 않고 곧 일을 시작하게 한다
    if (assignee.heartbeatEnabled) assignee.lastHeartbeatAt = undefined
    log('task', `${agent.name}가 ${taskKey(parent)}에서 ${assignee.name}에게 ${taskKey(task)} ${title}을 맡겼습니다.`, {
      taskId: task.id,
      agentId: assignee.id,
    })
    notify('task.delegated', `${agent.name} → ${assignee.name}: ${taskKey(task)} ${title}`, { taskId: task.id })
    persist()
    const when = assignee.heartbeatEnabled ? '곧 실행됩니다' : '자동 실행이 꺼져 있어 사람이 실행해야 합니다'
    return { text: `${taskKey(task)}을 ${assignee.name}에게 맡겼습니다 (${when}). id: ${task.id}`, isError: false }
  }

  if (name === 'list_subtasks') {
    const children = state.tasks.filter((t) => t.parentTaskId === parent.id)
    if (children.length === 0) return { text: '아직 맡긴 하위 작업이 없습니다.', isError: false }
    const lines = children.map((t) => {
      const who = state.agents.find((a) => a.id === t.assigneeId)?.name ?? '담당 없음'
      const result = lastResult(t)
      return `- ${taskKey(t)} ${t.title} | ${who} | 상태: ${t.status}${result ? `\n  마지막 결과: ${result}` : ''}`
    })
    return { text: lines.join('\n'), isError: false }
  }

  return { text: `알 수 없는 도구: ${name}`, isError: true }
}

const MCP_SERVER = fileURLToPath(new URL('./mcp-agentcrew.mjs', import.meta.url))

/** Claude Code, Codex에 붙일 MCP 서버 실행 정보 */
export function mcpServerSpec(d: { token: string; apiUrl: string }) {
  return {
    command: process.execPath,
    args: [MCP_SERVER],
    env: { AGENTCREW_URL: d.apiUrl, AGENTCREW_TOKEN: d.token },
  }
}

/** 하위 에이전트가 있는 에이전트에게 덧붙이는 안내 */
export const DELEGATION_GUIDE = `## 팀에 일 맡기기
당신에게는 하위 에이전트가 있습니다. agentcrew 도구를 쓸 수 있습니다.
- list_team: 하위 에이전트와 역할을 확인합니다.
- create_task: 하위 에이전트에게 일을 맡깁니다. 제목, 자세한 설명(완료 기준 포함), 담당 id를 넣습니다.
- list_subtasks: 이 작업에서 맡긴 일의 진행 상황과 결과를 봅니다.
먼저 작업을 파악하고, list_team으로 팀을 확인한 뒤 각자의 역할에 맞게 일을 나눠 맡기세요.
맡긴 일은 각 에이전트가 자기 차례에 실행합니다. 일을 맡겼으면 기다리지 말고, 누구에게 무엇을 맡겼는지 요약하고 끝내세요.`

/** 팀이 있지만 작업에서 위임을 막았을 때 덧붙이는 안내 */
export const NO_DELEGATION_GUIDE = `## 직접 처리하기
이 작업은 위임이 금지되어 있습니다. 하위 에이전트에게 맡기지 말고 직접 처리하세요.`

/** 승인 요청 도구를 쓸 수 있는 에이전트에게 덧붙이는 안내 */
export const APPROVAL_GUIDE = `## 승인 받기
사람의 확인이나 결정이 필요하면 agentcrew 도구의 request_approval로 승인 메뉴에 요청을 올리세요.
- title에는 무엇을 승인받는지 한 줄로, details에는 확인할 내용, 결과물 파일 위치, 고를 선택지, 승인되면 다음에 할 일을 적습니다.
- 요청을 올렸으면 승인 전에 하면 안 되는 일은 하지 말고, 지금까지 한 일을 요약하고 끝내세요.
- 승인되면 이 작업이 다시 실행되고, 승인 결과와 사람의 코멘트를 받아 이어서 진행합니다.
- 결과 글에 "승인해 주세요"라고 적기만 하면 사람에게 전달되지 않습니다. 반드시 request_approval을 쓰세요.`
