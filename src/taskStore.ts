import type { Goal, Project, Task, TaskPriority, TaskStatus } from './types'

/** 작업 번호 앞 글자. 설정에서 바꿀 수 있다 */
let taskPrefix = 'AC'

export function setTaskPrefix(prefix: string) {
  taskPrefix = prefix.trim() || 'AC'
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '할 일',
  in_progress: '진행 중',
  in_review: '검토 대기',
  done: '완료',
  cancelled: '취소',
}

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'cancelled']

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
}

export const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low']

export function taskKey(task: Pick<Task, 'number'>) {
  return `${taskPrefix}-${task.number}`
}

export function createTask(tasks: Task[]): Task {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    number: tasks.reduce((max, t) => Math.max(max, t.number), 0) + 1,
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    createdAt: now,
    updatedAt: now,
    runs: [],
  }
}

/** 에이전트에게 넘길 작업 지시문. 프로젝트와 목표가 있으면 왜 하는 일인지 맥락으로 붙인다 */
export function taskPrompt(task: Task, context: { project?: Project; goal?: Goal; parent?: Task; delegator?: string } = {}) {
  const lines = [`작업 ${taskKey(task)}: ${task.title.trim()}`]
  if (task.description.trim()) lines.push('', task.description.trim())
  const { project, goal, parent, delegator } = context
  if (project || goal || parent) {
    lines.push('', '맥락:')
    if (parent) lines.push(`- ${delegator ?? '상위 에이전트'}가 ${taskKey(parent)} ${parent.title} 작업에서 맡긴 일입니다.`)
    if (goal) lines.push(`- 목표: ${goal.title}${goal.description ? ` (${goal.description})` : ''}`)
    if (project) lines.push(`- 프로젝트: ${project.name}${project.description ? ` (${project.description})` : ''}`)
  }
  lines.push('', '작업을 마치면 무엇을 했는지 짧게 요약해 주세요.')
  return lines.join('\n')
}
