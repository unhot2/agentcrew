import { useEffect, useRef, useState } from 'react'
import { api, isBusy, type EditableKind, type ServerState } from './api'

const EDITABLE: EditableKind[] = ['agents', 'tasks', 'projects', 'goals', 'routines', 'skills', 'connectors']

/** 서버에서 받은 목록에, 아직 저장 중인 화면 쪽 항목을 덮어 합친다 */
function mergeList<T extends { id: string }>(kind: string, local: T[], server: T[]): T[] {
  const localById = new Map(local.map((x) => [x.id, x]))
  const serverIds = new Set(server.map((x) => x.id))
  const merged = server
    // 화면에서 지우는 중인 항목은 빼고
    .filter((x) => !(isBusy(kind, x.id) && !localById.has(x.id)))
    // 저장 중인 항목은 화면 값을 쓴다
    .map((x) => (isBusy(kind, x.id) && localById.has(x.id) ? localById.get(x.id)! : x))
  // 만들었지만 아직 서버에 도착하지 않은 항목
  const created = local.filter((x) => !serverIds.has(x.id) && isBusy(kind, x.id))
  return [...created, ...merged]
}

/**
 * 서버 데이터를 화면 상태로 들고 있는다. 서버가 바뀌었다고 알려오면(하트비트, 반복 업무, 실행 로그 등)
 * 다시 받아와 합친다.
 */
export function useServerState(initial: ServerState) {
  const [data, setData] = useState<ServerState>(initial)
  const loading = useRef(false)
  const again = useRef(false)

  const refresh = async () => {
    // 받아오는 중에 또 알림이 오면 끝난 뒤 한 번 더 받는다
    if (loading.current) {
      again.current = true
      return
    }
    loading.current = true
    try {
      const server = await api.state()
      setData((local) => {
        const next = { ...server } as ServerState
        for (const kind of EDITABLE) {
          ;(next as Record<string, unknown>)[kind] = mergeList(kind, local[kind] as never[], server[kind] as never[])
        }
        if (isBusy('settings', 'all')) next.settings = local.settings
        return next
      })
    } catch {
      // 서버가 잠시 꺼져 있으면 다음 알림 때 다시 시도한다
    } finally {
      loading.current = false
      if (again.current) {
        again.current = false
        refresh()
      }
    }
  }

  useEffect(() => {
    const source = new EventSource('/api/stream')
    source.onmessage = () => refresh()
    // 다시 연결되면 그 사이 바뀐 것을 받는다
    source.onopen = () => refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      source.close()
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const setList = <K extends EditableKind>(kind: K, update: (list: ServerState[K]) => ServerState[K]) =>
    setData((d) => ({ ...d, [kind]: update(d[kind]) }))

  return { data, setData, setList, refresh }
}
