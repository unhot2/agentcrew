/** 오피스 맵. 칸(16px) 단위 좌표를 쓴다. 왼쪽은 업무 공간, 오른쪽은 휴게실, 오른쪽 위 작은 방은 CEO방 */

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

/** CEO방 안쪽 (벽 제외). 왼쪽 벽은 x-1, 아래 벽은 bottom+1 줄에 있고 문은 아래 벽의 DOOR_X */
export const CEO_ROOM = { x: 21, y: 2, right: 25, bottom: 6 }
const CEO_DOOR_X = 23
export const CEO_DESK: Desk = { x: 22, y: 3, seat: { x: 22, y: 4 } }
/** 일반 책상 뒤에 CEO 책상을 붙인 전체 목록. CEO 책상의 번호는 DESKS.length */
export const ALL_DESKS: Desk[] = [...DESKS, CEO_DESK]

export type Furniture =
  | { kind: 'bookshelf' | 'boxes' | 'clock' | 'painting'; x: number; y: number }
  | { kind: 'plant' | 'cooler' | 'fridge' | 'counter' | 'table' | 'sofa'; x: number; y: number; w: number }

/** 벽에 붙은 장식은 막지 않고, 바닥에 놓인 가구는 지나갈 수 없다 */
export const WALL_DECOR: Furniture[] = [
  { kind: 'bookshelf', x: 2, y: 0 },
  { kind: 'bookshelf', x: 6, y: 0 },
  { kind: 'bookshelf', x: 10, y: 0 },
  { kind: 'clock', x: 14, y: 0 },
  { kind: 'clock', x: 18, y: 0 },
  { kind: 'painting', x: 22, y: 0 },
  { kind: 'bookshelf', x: 24, y: 0 },
]

export const FLOOR_ITEMS: Furniture[] = [
  { kind: 'plant', x: 0, y: 2, w: 1 },
  { kind: 'boxes', x: 14, y: 2 },
  { kind: 'plant', x: 15, y: 15, w: 1 },
  { kind: 'plant', x: 17, y: 2, w: 1 },
  { kind: 'cooler', x: 18, y: 2, w: 1 },
  { kind: 'fridge', x: 19, y: 2, w: 1 },
  { kind: 'counter', x: 23, y: 9, w: 2 },
  { kind: 'table', x: 20, y: 11, w: 2 },
  { kind: 'sofa', x: 19, y: 13, w: 4 },
  // CEO방
  { kind: 'plant', x: 21, y: 2, w: 1 },
  { kind: 'plant', x: 25, y: 2, w: 1 },
  { kind: 'sofa', x: 24, y: 6, w: 2 },
  { kind: 'plant', x: 25, y: 15, w: 1 },
  { kind: 'plant', x: 17, y: 15, w: 1 },
]

export const inCeoRoom = (x: number, y: number) => x >= CEO_ROOM.x && x <= CEO_ROOM.right && y >= CEO_ROOM.y && y <= CEO_ROOM.bottom
const ceoWall = (x: number, y: number) =>
  (x === CEO_ROOM.x - 1 && y >= CEO_ROOM.y && y <= CEO_ROOM.bottom + 1) ||
  (y === CEO_ROOM.bottom + 1 && x >= CEO_ROOM.x && x <= CEO_ROOM.right && x !== CEO_DOOR_X)

export const isWall = (x: number, y: number) => y < 2 || (x === PARTITION_X && !DOOR_ROWS.includes(y)) || ceoWall(x, y)
export const inLounge = (x: number, y: number) => x > PARTITION_X && !inCeoRoom(x, y) && !isWall(x, y)

const blocked = new Set<string>()
const key = (x: number, y: number) => `${x},${y}`
// 맨 아래 줄은 이름표가 화면 밖으로 잘리므로 걸어 다니지 않는다
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isWall(x, y) || y === ROWS - 1) blocked.add(key(x, y))
for (const d of ALL_DESKS) {
  blocked.add(key(d.x, d.y))
  blocked.add(key(d.x + 1, d.y))
}
for (const f of FLOOR_ITEMS) {
  const w = 'w' in f ? f.w : 1
  for (let i = 0; i < w; i++) blocked.add(key(f.x + i, f.y))
}

export const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked.has(key(x, y))

/** 쉴 때 서성일 수 있는 칸. CEO는 CEO방에서, 나머지는 휴게실에서 쉰다 (책상 의자는 뺀다) */
export const LOUNGE_SPOTS: Point[] = []
export const CEO_SPOTS: Point[] = []
for (let y = 3; y < ROWS; y++) {
  for (let x = PARTITION_X + 1; x < COLS; x++) {
    if (!walkable(x, y) || (x === CEO_DESK.seat.x && y === CEO_DESK.seat.y)) continue
    if (inCeoRoom(x, y)) CEO_SPOTS.push({ x, y })
    else if (inLounge(x, y)) LOUNGE_SPOTS.push({ x, y })
  }
}

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
