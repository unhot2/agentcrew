import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { adapterLabel } from '../adapters'
import { activityOf, type Activity } from '../office/activity'
import { EMPTY_ASSETS, loadOfficeAssets, type OfficeAssets } from '../office/assets'
import { characterHeight, drawBackground, drawBubble, drawCharacter, paletteFor, sceneItems, type Dir, type Drawable } from '../office/draw'
import { ALL_DESKS, CEO_SPOTS, COLS, DESKS, findPath, LOUNGE_SPOTS, nearestWalkable, ROWS, seatAt, SIGNS, TILE, visitSpot, type Point, type Seat } from '../office/map'
import type { Agent, Task } from '../types'

type Props = {
  agents: Agent[]
  tasks: Task[]
  onOpenTask: (id: string) => void
  onOpenAgent: (id: string) => void
}

const WIDTH = COLS * TILE
const HEIGHT = ROWS * TILE
/** 초당 이동 칸 수 */
const SPEED = 3.5
/** 다른 책상에 일을 전하러 가서 머무는 시간 */
const VISIT_MS = 2500
/** 소파에 놓으면 이만큼 앉아 있다가 일어난다 */
const SOFA_MS = 10_000
/** 이만큼(화면 픽셀) 움직여야 클릭이 아니라 끌기로 본다 */
const DRAG_THRESHOLD = 4

/** 화면에 그려지는 한 사람의 움직임 상태 */
type Sim = {
  x: number
  y: number
  path: Point[]
  dir: Dir
  goal: Point | null
  nextWander: number
  visit: { spot: Point; until: number | null } | null
  /** 이미 본 하위 작업. 새로 생기면 그 담당자 책상으로 걸어간다 */
  seenChildren: Set<string> | null
  /** 끌어다 놓은 자리. 쉬는 동안은 여기서 지내고, 일을 시작하면 잊는다 */
  pinned: Point | null
  /** 끌어다 소파에 놓았으면 sofaUntil까지 그 자리에 앉아 있다 */
  sofa: Seat | null
  sofaUntil: number
}

/** 끌고 있는 캐릭터. x, y는 맵 픽셀 좌표 */
type Drag = { id: string; x: number; y: number; startX: number; startY: number; moved: boolean }

const tileOf = (s: Sim): Point => ({ x: Math.round(s.x), y: Math.round(s.y) })
const same = (a: Point | null, b: Point | null) => !!a && !!b && a.x === b.x && a.y === b.y
const randomSpot = (spots: Point[]) => spots[Math.floor(Math.random() * spots.length)]

/** CEO방을 쓰는 사람: 보고 대상이 없는 최상위 에이전트. 여럿이면 직책에 CEO가 들어간 사람을 고른다 */
export function ceoOf(agents: Agent[]) {
  const ids = new Set(agents.map((a) => a.id))
  const top = agents.filter((a) => !a.reportsTo || !ids.has(a.reportsTo))
  return top.find((a) => /ceo/i.test(a.title)) ?? top[0] ?? null
}

/** CEO는 CEO방 책상, 나머지는 목록 순서대로 일반 책상. 값은 ALL_DESKS의 번호 */
function assignDesks(agents: Agent[]) {
  const ceo = ceoOf(agents)
  const deskOf = new Map<string, number>()
  if (ceo) deskOf.set(ceo.id, DESKS.length)
  agents.filter((a) => a !== ceo).slice(0, DESKS.length).forEach((a, i) => deskOf.set(a.id, i))
  return { ceo, deskOf }
}

/** 에이전트가 픽셀 캐릭터로 일하고 쉬는 모습. 대시보드 위쪽에 놓는다 */
export function OfficeView({ agents, tasks, onOpenTask, onOpenAgent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [assets, setAssets] = useState<OfficeAssets>(EMPTY_ASSETS)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [scale, setScale] = useState(2)
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<Drag | null>(null)

  const activities = new Map<string, Activity>(agents.map((a) => [a.id, activityOf(a, tasks)]))
  // 그리기 반복은 한 번만 만들고, 최신 값은 여기서 읽는다
  const live = useRef({ agents, tasks, activities, assets, hovered })
  live.current = { agents, tasks, activities, assets, hovered }
  const sims = useRef(new Map<string, Sim>())
  const hitboxes = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([])

  useEffect(() => {
    loadOfficeAssets().then(({ assets, error }) => {
      setAssets(assets)
      setAssetError(error)
    })
  }, [])

  // 카드 너비를 꽉 채우도록 키운다. 정수배가 아니어도 그릴 때 흐리게 보간하지 않아 픽셀 느낌은 유지된다
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    // 소수 둘째 자리에서 내려서 카드보다 넓어지지 않게 한다
    const fit = (width: number) => Math.max(1, Math.min(4, Math.floor((width / WIDTH) * 100) / 100))
    const observer = new ResizeObserver(([entry]) => setScale(fit(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const s = scale * dpr
    canvas.width = Math.round(WIDTH * s)
    canvas.height = Math.round(HEIGHT * s)
    const ctx = canvas.getContext('2d')!
    const off = document.createElement('canvas')
    off.width = WIDTH
    off.height = HEIGHT
    const octx = off.getContext('2d')!
    const bg = document.createElement('canvas')
    bg.width = WIDTH
    bg.height = HEIGHT
    let bgAssets: OfficeAssets | null = null

    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { agents, tasks, activities, assets, hovered } = live.current
      // 책상보다 사람이 많으면 남는 사람은 휴게실에 있다
      const { ceo, deskOf } = assignDesks(agents)

      // ---------- 움직임 ----------
      for (const id of sims.current.keys()) if (!activities.has(id)) sims.current.delete(id)
      for (const agent of agents) {
        const activity = activities.get(agent.id)!
        const deskIndex = deskOf.get(agent.id)
        const desk = deskIndex === undefined ? null : ALL_DESKS[deskIndex]
        // CEO는 CEO방에서, 나머지는 휴게실에서 쉰다
        const restSpots = agent === ceo ? CEO_SPOTS : LOUNGE_SPOTS
        const atDesk = !!desk && activity.kind !== 'idle' && activity.kind !== 'budget'
        let sim = sims.current.get(agent.id)
        if (!sim) {
          const start = atDesk ? desk.seat : randomSpot(restSpots)
          sim = { ...start, path: [], dir: 'down', goal: null, nextWander: now + Math.random() * 4000, visit: null, seenChildren: null, pinned: null, sofa: null, sofaUntil: 0 }
          sims.current.set(agent.id, sim)
        }
        // 끌고 있는 동안은 손에 들린 채로 멈춰 있다
        if (drag.current?.moved && drag.current.id === agent.id) continue

        // 실행 중에 하위 작업을 새로 만들면 그 담당자 책상까지 걸어가서 전한다
        const task = activity.task
        if (task) {
          const children = tasks.filter((t) => t.parentTaskId === task.id)
          if (!sim.seenChildren) sim.seenChildren = new Set(children.map((t) => t.id))
          for (const child of children) {
            if (sim.seenChildren.has(child.id)) continue
            sim.seenChildren.add(child.id)
            const target = child.assigneeId ? deskOf.get(child.assigneeId) : undefined
            if (target !== undefined && child.assigneeId !== agent.id) {
              sim.visit = { spot: visitSpot(ALL_DESKS[target]), until: null }
              sim.sofa = null
            }
          }
        } else {
          sim.seenChildren = null
        }

        // 소파에 앉은 지 시간이 지나면 일어나서 다시 쉬는 곳을 돌아다닌다
        if (sim.sofa && now > sim.sofaUntil) {
          sim.sofa = null
          sim.pinned = null
        }

        let goal: Point
        if (sim.visit) {
          goal = sim.visit.spot
          if (same(tileOf(sim), goal) && !sim.path.length) {
            sim.visit.until ??= now + VISIT_MS
            if (now > sim.visit.until) {
              sim.visit = null
              goal = atDesk ? desk.seat : randomSpot(restSpots)
            }
          }
        } else if (atDesk) {
          sim.pinned = null
          sim.sofa = null
          goal = desk.seat
        } else if (sim.pinned) {
          goal = sim.pinned
        } else {
          const here = tileOf(sim)
          const resting = (p: Point | null) => restSpots.some((r) => same(r, p))
          const settled = !sim.path.length && resting(here)
          goal = resting(sim.goal) && !(settled && now > sim.nextWander) ? sim.goal! : randomSpot(restSpots)
          if (!same(goal, sim.goal)) sim.nextWander = now + 4000 + Math.random() * 6000
        }
        if (!same(goal, sim.goal)) {
          sim.goal = goal
          // 이동 중이면 지금 향하던 칸까지 간 뒤 그 칸에서 다시 길을 찾는다
          const heading = sim.path[0]
          sim.path = heading ? [heading, ...findPath(heading, goal)] : findPath(tileOf(sim), goal)
        }
        const next = sim.path[0]
        if (next) {
          const dx = next.x - sim.x
          const dy = next.y - sim.y
          const dist = Math.hypot(dx, dy)
          const move = SPEED * dt
          if (Math.abs(dx) > 0.01) sim.dir = dx > 0 ? 'right' : 'left'
          else if (Math.abs(dy) > 0.01) sim.dir = dy > 0 ? 'down' : 'up'
          if (dist <= move) {
            sim.x = next.x
            sim.y = next.y
            sim.path.shift()
          } else {
            sim.x += (dx / dist) * move
            sim.y += (dy / dist) * move
          }
        } else if (sim.visit) {
          sim.dir = 'up'
        }
      }

      // ---------- 그리기 ----------
      if (bgAssets !== assets) {
        const bctx = bg.getContext('2d')!
        bctx.clearRect(0, 0, WIDTH, HEIGHT)
        drawBackground(bctx, assets)
        bgAssets = assets
      }
      octx.imageSmoothingEnabled = false
      octx.drawImage(bg, 0, 0)
      const walkFrame = Math.floor(now / 140)
      const slowFrame = Math.floor(now / 400)
      const busyDesks = new Set(
        agents.filter((a) => activities.get(a.id)!.task && deskOf.has(a.id)).map((a) => deskOf.get(a.id)!),
      )
      const drawables: Drawable[] = sceneItems(assets, (i) => busyDesks.has(i), slowFrame)
      const labels: { id: string; name: string; x: number; y: number }[] = []
      const boxes: typeof hitboxes.current = []
      agents.forEach((agent, index) => {
        const sim = sims.current.get(agent.id)
        if (!sim) return
        const activity = activities.get(agent.id)!
        const deskIndex = deskOf.get(agent.id)
        const seated =
          deskIndex !== undefined && !sim.path.length && !sim.visit && same(tileOf(sim), ALL_DESKS[deskIndex].seat) && activity.kind !== 'idle'
        // 소파에 앉아 있으면 소파 위 자리에, 앉은 방향을 보고 그린다
        const sofa = !seated && sim.sofa && !sim.path.length && !sim.visit && same(tileOf(sim), sim.sofa) ? sim.sofa : null
        const fx = seated ? ALL_DESKS[deskIndex!].x * TILE + TILE : sofa ? sofa.fx : sim.x * TILE + TILE / 2
        // 큰 캐릭터 그림은 모니터를 가리지 않게 의자 쪽으로 조금 더 내려 앉힌다
        const fy = seated ? sim.y * TILE + (assets.characters.length ? 15 : 10) : sofa ? sofa.fy : sim.y * TILE + 14
        const walking = sim.path.length > 0
        const typing = seated && (activity.kind === 'typing' || activity.kind === 'terminal' || activity.kind === 'thinking')
        const palette = paletteFor(agent.id, agent.adapter.type)
        const head = fy - characterHeight(assets, seated)
        const held = drag.current?.moved && drag.current.id === agent.id ? drag.current : null
        if (held) {
          // 손에 들린 캐릭터는 포인터에 매달려 발을 버둥거리고, 다른 것보다 위에 그린다
          const hx = held.x
          const hy = held.y + 12
          drawables.push({
            baseY: Infinity,
            draw: (c) => drawCharacter(c, assets, index, { fx: hx, fy: hy, dir: 'down', walking: true, seated: false, typing: false }, walkFrame, palette),
          })
          labels.push({ id: agent.id, name: agent.name || '이름 없음', x: hx, y: hy + 2 })
          return
        }
        drawables.push({
          baseY: sofa ? sofa.baseY : fy,
          draw: (c) => {
            if (sofa) {
              // 다리를 가려 소파 방석에 앉은 것처럼 보이게 한다
              c.save()
              c.beginPath()
              c.rect(fx - 20, fy - 48, 40, 43)
              c.clip()
              // 안마의자에 앉으면 몸이 바르르 떨린다
              const shake = sofa.massage ? (walkFrame % 2 ? 1 : -1) : 0
              drawCharacter(c, assets, index, { fx: fx + shake, fy, dir: sofa.facing, walking: false, seated: false, typing: false }, slowFrame, palette)
              c.restore()
            } else {
              drawCharacter(c, assets, index, { fx, fy, dir: sim.dir, walking, seated, typing }, walking ? walkFrame : slowFrame, palette)
            }
            // 앉아 있으면 모니터를 가리지 않게 말풍선을 머리 오른쪽 옆에 띄운다
            if (!walking) drawBubble(c, seated ? fx + 14 : fx, seated ? head + 6 : head, activity.kind, slowFrame)
          },
        })
        labels.push({ id: agent.id, name: agent.name || '이름 없음', x: fx, y: fy + 2 })
        boxes.push({ id: agent.id, x: fx - 7, y: head - 10, w: 14, h: fy - head + 12 })
      })
      drawables.sort((a, b) => a.baseY - b.baseY)
      for (const d of drawables) d.draw(octx)

      ctx.imageSmoothingEnabled = false
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
      // 표지판과 이름은 키운 화면에 그려야 글자가 또렷하다
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const sign of SIGNS) {
        const x = (sign.x * TILE + 1) * s
        const y = (sign.y * TILE + 3) * s
        const w = (sign.w * TILE - 2) * s
        const h = 10 * s
        ctx.fillStyle = '#1c2232'
        ctx.fillRect(x - s, y - s, w + 2 * s, h + 2 * s)
        ctx.fillStyle = sign.bg
        ctx.fillRect(x, y, w, h)
        // 표지판 폭에 들어가도록 글자 크기를 줄인다
        let size = 7 * s
        ctx.font = `700 ${size}px system-ui, sans-serif`
        const room = w - 3 * s
        const textW = ctx.measureText(sign.text).width
        if (textW > room) {
          size *= room / textW
          ctx.font = `700 ${size}px system-ui, sans-serif`
        }
        ctx.fillStyle = sign.color
        ctx.fillText(sign.text, x + w / 2, y + h / 2 + s / 2)
      }
      ctx.font = `600 ${Math.round(11 * dpr)}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      for (const l of labels) {
        const w = ctx.measureText(l.name).width + 8 * dpr
        const x = l.x * s
        const y = l.y * s
        ctx.fillStyle = l.id === hovered ? 'rgba(217,119,87,0.95)' : 'rgba(20,22,30,0.75)'
        ctx.fillRect(x - w / 2, y, w, 15 * dpr)
        ctx.fillStyle = '#fff'
        ctx.fillText(l.name, x, y + 2 * dpr)
      }
      hitboxes.current = boxes
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [scale])

  const toMap = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT }
  }

  const agentAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toMap(e)
    // 앞에 그려진 사람(아래쪽)을 먼저 고른다
    const hit = [...hitboxes.current].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
    return hit?.id ?? null
  }

  /** 소파에 놓으면 그 자리에 잠시 앉히고, 아니면 놓은 자리(발 위치)에서 가장 가까운 걸을 수 있는 칸에 세운다 */
  const drop = (d: Drag) => {
    const sim = sims.current.get(d.id)
    if (!sim) return
    const feet = { x: Math.floor(d.x / TILE), y: Math.floor((d.y + 12) / TILE) }
    const pointer = { x: Math.floor(d.x / TILE), y: Math.floor(d.y / TILE) }
    const taken = (seat: Seat) => [...sims.current.entries()].some(([id, s]) => id !== d.id && s.sofa === seat)
    const seat = [seatAt(feet), seatAt(pointer)].find((s) => s && !taken(s))
    if (seat) {
      const spot = { x: seat.x, y: seat.y }
      Object.assign(sim, { ...spot, path: [], goal: spot, pinned: spot, visit: null, dir: seat.facing, sofa: seat, sofaUntil: performance.now() + SOFA_MS })
      return
    }
    const spot = nearestWalkable(feet)
    if (!spot) return
    Object.assign(sim, { x: spot.x, y: spot.y, path: [], goal: spot, pinned: spot, visit: null, dir: 'down', sofa: null })
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const id = agentAt(e)
    if (!id || e.button !== 0) return
    const { x, y } = toMap(e)
    drag.current = { id, x, y, startX: e.clientX, startY: e.clientY, moved: false }
    // 캔버스 밖으로 끌고 나가도 놓는 순간을 받을 수 있게 한다
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 이미 끝난 포인터면 붙잡지 못해도 끌기는 동작한다
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) {
      setHovered(agentAt(e))
      return
    }
    Object.assign(d, toMap(e))
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
      d.moved = true
      setDragging(true)
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d) return
    // 거의 움직이지 않았으면 클릭으로 보고 작업이나 에이전트를 연다
    if (d.moved) drop(d)
    else open(d.id)
  }

  const open = (id: string) => {
    const task = activities.get(id)?.task
    if (task) onOpenTask(task.id)
    else onOpenAgent(id)
  }

  return (
    <section className="card office-card">
      <header className="card-header">
        <h2>오피스</h2>
        <span className="muted">캐릭터를 누르면 작업이나 설정이 열리고, 끌어다 놓으면 그 자리로 옮겨집니다</span>
      </header>
      {assetError && <div className="notice error-notice">{assetError} 직접 그린 그림으로 표시합니다.</div>}
      <div className="office-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="office-canvas"
          style={{ width: WIDTH * scale, height: HEIGHT * scale, cursor: dragging ? 'grabbing' : hovered ? 'grab' : 'default', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null
            setDragging(false)
          }}
          onPointerLeave={() => {
            if (!drag.current) setHovered(null)
          }}
        />
      </div>
      {agents.length > ALL_DESKS.length && (
        <p className="muted">책상이 CEO방을 포함해 {ALL_DESKS.length}개라서 나머지 에이전트는 휴게실에 있습니다.</p>
      )}
      <ul className="office-roster">
        {agents.map((a) => {
          const activity = activities.get(a.id)!
          return (
            <li key={a.id}>
              <button
                className={`office-roster-item${hovered === a.id ? ' hovered' : ''}`}
                onMouseEnter={() => setHovered(a.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => open(a.id)}
              >
                {/* 사이드바 점과 같은 상태 색. 실행 중 오류를 만나면 빨간색 */}
                <span
                  className={`office-swatch status-${activity.kind === 'error' ? 'error' : a.status}`}
                  title={activity.label}
                  aria-hidden
                />
                <span className="office-roster-text">
                  <span className="office-roster-line">
                    <span className="office-roster-name">{a.name || '이름 없음'}</span>
                    <span className="muted">
                      {a.title || adapterLabel(a.adapter.type)} · {activity.label}
                    </span>
                  </span>
                  {/* 무슨 작업을 하는지는 아랫줄에 */}
                  {activity.task && <span className="muted office-roster-task">{activity.task.title}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
