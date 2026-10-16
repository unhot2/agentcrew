import { randomUUID } from 'node:crypto'
import type { Routine, Task } from '../src/types.ts'
import { taskKey } from '../src/taskStore.ts'
import { requestRun } from './api.ts'
import { log, persist, state } from './db.ts'
import { RUNNABLE } from './runner.ts'
import { nextRunAt } from './schedule.ts'

const TICK_MS = 15_000
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 }

/** 거절당한 뒤 고친 적 없는 작업이나 승인을 기다리는 작업은 하트비트가 다시 가져가지 않는다 */
function blockedByApproval(task: Task) {
  return state.approvals.some(
    (a) =>
      a.taskId === task.id &&
      (a.status === 'pending' || (a.status === 'rejected' && (a.decidedAt ?? '') >= task.updatedAt)),
  )
}

function fireRoutine(routine: Routine, at: number) {
  const stamp = new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const task: Task = {
    id: randomUUID(),
    number: Math.max(0, ...state.tasks.map((t) => t.number)) + 1,
    title: `${routine.name} · ${stamp}`,
    description: routine.description,
    status: 'todo',
    priority: routine.priority,
    assigneeId: routine.assigneeId,
    projectId: routine.projectId,
    createdAt: new Date(at).toISOString(),
    updatedAt: new Date(at).toISOString(),
    runs: [],
  }
  state.tasks.unshift(task)
  routine.lastRunAt = new Date(at).toISOString()
  routine.nextRunAt = nextRunAt(routine.schedule, at)
  log('routine', `반복 업무 ${routine.name}이(가) 작업 ${taskKey(task)}을 만들었습니다.`, {
    taskId: task.id,
    agentId: routine.assigneeId ?? undefined,
  })
  if (routine.runImmediately && routine.assigneeId) requestRun(task, 'routine')
}

/** 하트비트: 실행 주기가 된 에이전트가 자기에게 배정된 할 일 중 가장 급한 것을 가져가 실행한다 */
function heartbeat(at: number) {
  for (const agent of state.agents) {
    if (!agent.heartbeatEnabled || agent.status !== 'idle') continue
    if (!RUNNABLE.has(agent.adapter.type)) continue
    const interval = Math.max(1, agent.heartbeatMinutes) * 60_000
    if (agent.lastHeartbeatAt && at - Date.parse(agent.lastHeartbeatAt) < interval) continue
    agent.lastHeartbeatAt = new Date(at).toISOString()
    persist()
    const next = state.tasks
      .filter((t) => t.assigneeId === agent.id && t.status === 'todo' && !blockedByApproval(t))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.number - b.number)[0]
    if (next) requestRun(next, 'heartbeat')
  }
}

function tick() {
  if (!state.settings.automationEnabled) return
  const at = Date.now()
  for (const routine of state.routines) {
    if (routine.enabled && routine.nextRunAt && Date.parse(routine.nextRunAt) <= at) fireRoutine(routine, at)
  }
  heartbeat(at)
}

export function startScheduler() {
  setTimeout(tick, 3_000)
  setInterval(tick, TICK_MS)
}
