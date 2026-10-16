import type { Project, ProjectStatus } from './types'

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: '계획',
  active: '진행 중',
  paused: '보류',
  completed: '완료',
}

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['active', 'planned', 'paused', 'completed']

/** 프로젝트 색. 목록과 작업 화면에서 프로젝트를 구분하는 점으로 쓴다 */
export const PROJECT_COLORS = ['#7f77dd', '#1d9e75', '#d85a30', '#d4537e', '#378add', '#ba7517', '#639922', '#888780']

export function createProject(projects: Project[]): Project {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    status: 'active',
    color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    leadAgentId: null,
    createdAt: new Date().toISOString(),
  }
}
