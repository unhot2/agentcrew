/** 오피스 맵. 칸(16px) 단위 좌표를 쓴다. 왼쪽은 업무 공간, 오른쪽은 휴게실 */

export const TILE = 16
export const COLS = 26
export const ROWS = 16

/** 업무 공간과 휴게실을 나누는 벽의 x. 문은 DOOR_ROWS 줄에 있다 */
export const PARTITION_X = 16
const DOOR_ROWS = [6, 7]

export type Point = { x: number; y: number }

/** 책상은 가로 두 칸이고, 바로 아래 칸이 의자(앉는 자리)다 */
export type Desk = { x: number; y: number; seat: Point }

const DESK_XS = [1, 5, 9, 13]
const DESK_YS = [4, 8, 12]

export const DESKS: Desk[] = DESK_YS.flatMap((y) => DESK_XS.map((x) => ({ x, y, seat: { x, y: y + 1 } })))

export type Furniture =
  | { kind: 'bookshelf' | 'boxes' | 'clock' | 'painting'; x: number; y: number }
  | { kind: 'plant' | 'cooler' | 'fridge' | 'counter' | 'table' | 'sofa'; x: number; y: number; w: number }

/** 벽에 붙은 장식은 막지 않고, 바닥에 놓인 가구는 지나갈 수 없다 */
export const WALL_DECOR: Furniture[] = [
  { kind: 'bookshelf', x: 2, y: 0 },
  { kind: 'bookshelf', x: 6, y: 0 },
  { kind: 'bookshelf', x: 10, y: 0 },
  { kind: 'clock', x: 14, y: 0 },
  { kind: 'painting', x: 21, y: 0 },
]

export const FLOOR_ITEMS: Furniture[] = [
  { kind: 'plant', x: 0, y: 2, w: 1 },
  { kind: 'boxes', x: 14, y: 2 },
  { kind: 'plant', x: 15, y: 15, w: 1 },
  { kind: 'plant', x: 17, y: 2, w: 1 },
  { kind: 'cooler', x: 18, y: 2, w: 1 },
  { kind: 'counter', x: 22, y: 2, w: 2 },
  { kind: 'fridge', x: 24, y: 2, w: 1 },
  { kind: 'table', x: 20, y: 10, w: 2 },
  { kind: 'sofa', x: 19, y: 12, w: 4 },
  { kind: 'plant', x: 25, y: 15, w: 1 },
  { kind: 'plant', x: 17, y: 15, w: 1 },
]

export const isWall = (x: number, y: number) => y < 2 || (x === PARTITION_X && !DOOR_ROWS.includes(y))
export const inLounge = (x: number) => x > PARTITION_X

const blocked = new Set<string>()
const key = (x: number, y: number) => `${x},${y}`
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isWall(x, y)) blocked.add(key(x, y))
for (const d of DESKS) {
  blocked.add(key(d.x, d.y))
  blocked.add(key(d.x + 1, d.y))
}
for (const f of FLOOR_ITEMS) {
  const w = 'w' in f ? f.w : 1
  for (let i = 0; i < w; i++) blocked.add(key(f.x + i, f.y))
}

export const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked.has(key(x, y))

/** 휴게실에서 서성일 수 있는 칸 */
export const LOUNGE_SPOTS: Point[] = []
for (let y = 3; y < ROWS; y++) for (let x = PARTITION_X + 1; x < COLS; x++) if (walkable(x, y)) LOUNGE_SPOTS.push({ x, y })

/** 다른 사람 책상에 일을 전하러 갈 때 서는 자리 (의자 옆) */
export function visitSpot(desk: Desk): Point {
  // 앉은 사람은 책상 가운데에 그려지므로 책상 오른쪽 바깥 칸에 선다
  const right = { x: desk.x + 2, y: desk.seat.y }
  return walkable(right.x, right.y) ? right : { x: desk.x - 1, y: desk.seat.y }
}

/** 가장 짧은 길 (상하좌우). 시작 칸은 빼고 목적지까지의 칸을 돌려준다. 길이 없으면 빈 배열 */
export function findPath(from: Point, to: Point): Point[] {
  if (from.x === to.x && from.y === to.y) return []
  const prev = new Map<string, Point | null>([[key(from.x, from.y), null]])
  const queue: Point[] = [from]
  while (queue.length) {
    const p = queue.shift()!
    if (p.x === to.x && p.y === to.y) {
      const path: Point[] = []
      for (let c: Point | null = p; c && !(c.x === from.x && c.y === from.y); c = prev.get(key(c.x, c.y)) ?? null) path.unshift(c)
      return path
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: p.x + dx, y: p.y + dy }
      if (prev.has(key(n.x, n.y)) || !walkable(n.x, n.y)) continue
      prev.set(key(n.x, n.y), p)
      queue.push(n)
    }
  }
  return []
}
