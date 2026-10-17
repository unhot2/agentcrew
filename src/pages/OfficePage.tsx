import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { adapterLabel } from '../adapters'
import { activityOf, type Activity } from '../office/activity'
import { EMPTY_ASSETS, loadOfficeAssets, type OfficeAssets } from '../office/assets'
import { drawBackground, drawBubble, drawCharacter, paletteFor, sceneItems, type Dir, type Drawable } from '../office/draw'
import { COLS, DESKS, findPath, inLounge, LOUNGE_SPOTS, ROWS, TILE, visitSpot, type Point } from '../office/map'
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
}

const randomLounge = () => LOUNGE_SPOTS[Math.floor(Math.random() * LOUNGE_SPOTS.length)]
const tileOf = (s: Sim): Point => ({ x: Math.round(s.x), y: Math.round(s.y) })
const same = (a: Point | null, b: Point | null) => !!a && !!b && a.x === b.x && a.y === b.y

export function OfficePage({ agents, tasks, onOpenTask, onOpenAgent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [assets, setAssets] = useState<OfficeAssets>(EMPTY_ASSETS)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [scale, setScale] = useState(2)
  const [hovered, setHovered] = useState<string | null>(null)

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

  // 화면 너비에 맞춰 정수배로 키운다 (픽셀이 흐려지지 않게)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setScale(Math.max(1, Math.min(4, Math.floor(entry.contentRect.width / WIDTH)))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const s = scale * dpr
    canvas.width = WIDTH * s
    canvas.height = HEIGHT * s
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
      // 책상은 에이전트 목록 순서대로 배정한다. 책상보다 많으면 남는 사람은 휴게실에 있다
      const deskOf = new Map(agents.slice(0, DESKS.length).map((a, i) => [a.id, i]))

      // ---------- 움직임 ----------
      for (const id of sims.current.keys()) if (!activities.has(id)) sims.current.delete(id)
      for (const agent of agents) {
        const activity = activities.get(agent.id)!
        const deskIndex = deskOf.get(agent.id)
        const desk = deskIndex === undefined ? null : DESKS[deskIndex]
        const atDesk = !!desk && activity.kind !== 'idle' && activity.kind !== 'budget'
        let sim = sims.current.get(agent.id)
        if (!sim) {
          const start = atDesk ? desk.seat : randomLounge()
          sim = { ...start, path: [], dir: 'down', goal: null, nextWander: now + Math.random() * 4000, visit: null, seenChildren: null }
          sims.current.set(agent.id, sim)
        }

        // 실행 중에 하위 작업을 새로 만들면 그 담당자 책상까지 걸어가서 전한다
        const task = activity.task
        if (task) {
          const children = tasks.filter((t) => t.parentTaskId === task.id)
          if (!sim.seenChildren) sim.seenChildren = new Set(children.map((t) => t.id))
          for (const child of children) {
            if (sim.seenChildren.has(child.id)) continue
            sim.seenChildren.add(child.id)
            const target = child.assigneeId ? deskOf.get(child.assigneeId) : undefined
            if (target !== undefined && child.assigneeId !== agent.id) sim.visit = { spot: visitSpot(DESKS[target]), until: null }
          }
        } else {
          sim.seenChildren = null
        }

        let goal: Point
        if (sim.visit) {
          goal = sim.visit.spot
          if (same(tileOf(sim), goal) && !sim.path.length) {
            sim.visit.until ??= now + VISIT_MS
            if (now > sim.visit.until) {
              sim.visit = null
              goal = atDesk ? desk.seat : randomLounge()
            }
          }
        } else if (atDesk) {
          goal = desk.seat
        } else {
          const here = tileOf(sim)
          const settled = !sim.path.length && inLounge(here.x)
          goal = sim.goal && inLounge(sim.goal.x) && !(settled && now > sim.nextWander) ? sim.goal : randomLounge()
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
          deskIndex !== undefined && !sim.path.length && !sim.visit && same(tileOf(sim), DESKS[deskIndex].seat) && activity.kind !== 'idle'
        const fx = seated ? DESKS[deskIndex!].x * TILE + TILE : sim.x * TILE + TILE / 2
        const fy = seated ? sim.y * TILE + 10 : sim.y * TILE + 14
        const walking = sim.path.length > 0
        const typing = seated && (activity.kind === 'typing' || activity.kind === 'terminal' || activity.kind === 'thinking')
        const palette = paletteFor(agent.id, agent.adapter.type)
        const head = seated ? fy - 19 : fy - 21
        drawables.push({
          baseY: fy,
          draw: (c) => {
            drawCharacter(c, assets, index, { fx, fy, dir: sim.dir, walking, seated, typing }, walking ? walkFrame : slowFrame, palette)
            if (!walking) drawBubble(c, fx, head, activity.kind, slowFrame)
          },
        })
        labels.push({ id: agent.id, name: agent.name || '이름 없음', x: fx, y: fy + 2 })
        boxes.push({ id: agent.id, x: fx - 7, y: head - 10, w: 14, h: fy - head + 12 })
      })
      drawables.sort((a, b) => a.baseY - b.baseY)
      for (const d of drawables) d.draw(octx)

      ctx.imageSmoothingEnabled = false
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
      // 이름은 키운 화면에 그려야 글자가 또렷하다
      ctx.font = `600 ${Math.round(11 * dpr)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
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

  const agentAt = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH
    const y = ((e.clientY - rect.top) / rect.height) * HEIGHT
    // 앞에 그려진 사람(아래쪽)을 먼저 고른다
    const hit = [...hitboxes.current].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
    return hit?.id ?? null
  }

  const open = (id: string) => {
    const task = activities.get(id)?.task
    if (task) onOpenTask(task.id)
    else onOpenAgent(id)
  }

  return (
    <div className="page office-page">
      {assetError && <div className="notice error-notice">{assetError} 직접 그린 그림으로 표시합니다.</div>}
      <div className="office-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="office-canvas"
          style={{ width: WIDTH * scale, height: HEIGHT * scale, cursor: hovered ? 'pointer' : 'default' }}
          onMouseMove={(e) => setHovered(agentAt(e))}
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            const id = agentAt(e)
            if (id) open(id)
          }}
        />
      </div>
      {agents.length > DESKS.length && (
        <p className="muted">책상이 {DESKS.length}개라서 나머지 에이전트는 휴게실에 있습니다.</p>
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
                <span className="office-swatch" style={{ background: paletteFor(a.id, a.adapter.type).shirt }} aria-hidden />
                <span className="office-roster-name">{a.name || '이름 없음'}</span>
                <span className="muted">
                  {a.title || adapterLabel(a.adapter.type)} · {activity.label}
                  {activity.task ? ` · ${activity.task.title}` : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
