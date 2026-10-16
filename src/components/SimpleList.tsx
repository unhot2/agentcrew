export type SimpleItem = {
  id: string
  title: string
  sub?: string
  color?: string
  dim?: boolean
}

type Props = {
  items: SimpleItem[]
  selectedId: string | null
  empty: string
  onSelect: (id: string) => void
}

/** 목록과 상세로 나뉜 화면의 왼쪽 목록 */
export function SimpleList({ items, selectedId, empty, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <ul className="agent-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className={`agent-row${item.id === selectedId ? ' selected' : ''}${item.dim ? ' dim' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              {item.color && <span className="project-swatch" style={{ background: item.color }} />}
              <span className="agent-row-text">
                <span className="agent-row-name">{item.title}</span>
                {item.sub && <span className="agent-row-sub">{item.sub}</span>}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="empty">{empty}</li>}
      </ul>
    </aside>
  )
}

type EmptyProps = { title: string; body: string; action: string; onAction: () => void }

export function EmptyDetail({ title, body, action, onAction }: EmptyProps) {
  return (
    <section className="detail empty-state">
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <button className="primary" onClick={onAction}>
        {action}
      </button>
    </section>
  )
}
