import { ProjectDetail } from '../components/ProjectDetail'
import { ProjectList } from '../components/ProjectList'
import type { Agent, Goal, Project, Task } from '../types'

type Props = {
  projects: Project[]
  tasks: Task[]
  agents: Agent[]
  goals: Goal[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onChange: (id: string, patch: Partial<Project>) => void
  onDelete: (id: string) => void
  onOpenTask: (id: string) => void
  onNewTask: (projectId: string) => void
}

export function ProjectsPage(props: Props) {
  const { projects, tasks, agents, goals, selectedId, onSelect, onAdd } = props
  const project = projects.find((p) => p.id === selectedId) ?? null

  const remove = (p: Project) => {
    const count = tasks.filter((t) => t.projectId === p.id).length
    const note = count ? ` 작업 ${count}개는 지워지지 않고 프로젝트 없음으로 남습니다.` : ''
    if (!window.confirm(`프로젝트 '${p.name || '이름 없음'}'을 삭제할까요?${note}`)) return
    props.onDelete(p.id)
  }

  return (
    <main className="layout">
      <ProjectList projects={projects} tasks={tasks} selectedId={selectedId} onSelect={onSelect} />
      {project ? (
        <ProjectDetail
          key={project.id}
          project={project}
          tasks={tasks}
          agents={agents}
          goals={goals}
          onChange={(patch) => props.onChange(project.id, patch)}
          onDelete={() => remove(project)}
          onOpenTask={props.onOpenTask}
          onNewTask={() => props.onNewTask(project.id)}
        />
      ) : (
        <section className="detail empty-state">
          <h1>{projects.length ? '프로젝트를 선택하세요' : '첫 프로젝트를 만들어 보세요'}</h1>
          <p className="muted">관련된 작업을 프로젝트로 묶으면 진행률과 비용을 한눈에 볼 수 있습니다.</p>
          <button className="primary" onClick={onAdd}>
            새 프로젝트
          </button>
        </section>
      )}
    </main>
  )
}
