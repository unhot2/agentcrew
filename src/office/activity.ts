import type { Agent, Task } from '../types'

export type ActivityKind = 'thinking' | 'typing' | 'reading' | 'terminal' | 'delegating' | 'error' | 'idle' | 'paused' | 'budget'

export type Activity = {
  kind: ActivityKind
  label: string
  /** 지금 실행 중인 작업 */
  task: Task | null
}

const LABEL: Record<ActivityKind, string> = {
  thinking: '생각 중',
  typing: '코드 작성 중',
  reading: '파일 읽는 중',
  terminal: '명령 실행 중',
  delegating: '일 맡기는 중',
  error: '오류 확인 중',
  idle: '휴식 중',
  paused: '일시 정지',
  budget: '예산 초과',
}

const TYPING = /^(write|edit|multiedit|notebookedit|write_file|edit_file|patch|apply_patch|str_replace|create_file)$/
const READING = /^(read|grep|glob|ls|read_file|list_files|search|search_files|webfetch|websearch|web_search|fetch)$/
const TERMINAL = /^(bash|powershell|shell|terminal|exec|exec_command|run_command|command_execution)$/

/** 어댑터마다 도구 이름이 달라서 접두사를 떼고 소문자로 맞춘다 (mcp__agentcrew__create_task, agentcrew:create_task 등) */
function toolKind(name: string): ActivityKind {
  const n = name.toLowerCase().replace(/^mcp__[^_]+__/, '').replace(/^[\w-]+:/, '')
  if (n === 'create_task') return 'delegating'
  if (n === 'list_team' || n === 'list_subtasks' || n === 'toolsearch') return 'thinking'
  if (TYPING.test(n)) return 'typing'
  if (READING.test(n)) return 'reading'
  if (TERMINAL.test(n)) return 'terminal'
  return 'typing'
}

export function runningTaskOf(agent: Agent, tasks: Task[]) {
  return tasks.find((t) => t.runs.some((r) => r.status === 'running' && r.agentId === agent.id)) ?? null
}

/** 에이전트의 상태와 실행 중인 작업의 마지막 이벤트로 지금 하는 일을 정한다 */
export function activityOf(agent: Agent, tasks: Task[]): Activity {
  const make = (kind: ActivityKind, task: Task | null = null): Activity => ({ kind, label: LABEL[kind], task })
  const task = runningTaskOf(agent, tasks)
  if (!task) {
    if (agent.status === 'paused') return make('paused')
    if (agent.status === 'over-budget') return make('budget')
    return make('idle')
  }
  const run = task.runs.find((r) => r.status === 'running' && r.agentId === agent.id)!
  for (let i = run.events.length - 1; i >= 0; i--) {
    const e = run.events[i]
    if (e.kind === 'tool') return make(toolKind(e.name), task)
    if (e.kind === 'tool_result') {
      if (e.isError) return make('error', task)
      continue
    }
    if (e.kind === 'error') return make('error', task)
    if (e.kind === 'text' || e.kind === 'init') return make('thinking', task)
  }
  return make('thinking', task)
}
