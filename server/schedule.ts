import type { RoutineSchedule } from '../src/types.ts'

/** from 이후 처음 돌아오는 실행 시각. 계산할 수 없으면 null */
export function nextRunAt(schedule: RoutineSchedule, from = Date.now()): string | null {
  if (schedule.kind === 'interval') {
    const minutes = Math.max(1, Number(schedule.minutes) || 0)
    return new Date(from + minutes * 60_000).toISOString()
  }
  const [h, m] = schedule.time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const candidate = new Date(from)
  candidate.setHours(h, m, 0, 0)
  // 오늘부터 일주일 안에서 요일 조건에 맞는 가장 가까운 시각을 찾는다
  for (let i = 0; i < 8; i++) {
    const okDay = schedule.days.length === 0 || schedule.days.includes(candidate.getDay())
    if (candidate.getTime() > from && okDay) return candidate.toISOString()
    candidate.setDate(candidate.getDate() + 1)
  }
  return null
}
