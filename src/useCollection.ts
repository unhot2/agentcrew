import { api, type EditableKind, type ServerState } from './api'

type SetList = <K extends EditableKind>(kind: K, update: (list: ServerState[K]) => ServerState[K]) => void

/** 목록 하나를 화면에서 바로 고치고 서버에 저장하는 공통 동작 */
export function useCollection<K extends EditableKind>(kind: K, list: ServerState[K], setList: SetList) {
  type Item = ServerState[K][number]

  const add = (item: Item, position: 'start' | 'end' = 'end') => {
    setList(kind, (l) => ((position === 'start' ? [item, ...l] : [...l, item]) as ServerState[K]))
    api.save(kind, item)
    return item.id
  }

  /** 입력 중 변경은 모아서 저장한다. now를 주면 바로 저장한다 */
  const patch = (id: string, changes: Partial<Item>, now = false) => {
    const current = (list as Item[]).find((x) => x.id === id)
    if (!current) return
    const next = { ...current, ...changes } as Item
    setList(kind, (l) => (l as Item[]).map((x) => (x.id === id ? next : x)) as ServerState[K])
    if (now) api.save(kind, next)
    else api.saveLater(kind, next)
  }

  const remove = (id: string) => {
    setList(kind, (l) => (l as Item[]).filter((x) => x.id !== id) as ServerState[K])
    api.remove(kind, id)
  }

  return { add, patch, remove }
}
