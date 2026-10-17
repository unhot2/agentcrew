/**
 * 오피스 맵. 칸(16px) 단위 좌표를 쓴다. 왼쪽 위는 업무 공간, 왼쪽 아래는 서버실과 회의실,
 * 오른쪽은 휴게실, 오른쪽 위 작은 방은 CEO방
 */

export const TILE = 16
export const COLS = 26
export const ROWS = 16

/** 업무 공간과 휴게실을 나누는 벽의 x (화면 절반). 문은 DOOR_ROWS 줄에 있다 */
export const PARTITION_X = 13
const DOOR_ROWS = [6, 7]

export type Point = { x: number; y: number }

/** 책상은 가로 두 칸이고, 바로 아래 칸이 의자(앉는 자리)다 */
export type Desk = { x: number; y: number; seat: Point }

const DESK_XS = [1, 4, 7, 10]
const DESK_YS = [4, 8]

export const DESKS: Desk[] = DESK_YS.flatMap((y) => DESK_XS.map((x) => ({ x, y, seat: { x, y: y + 1 } })))

/** 업무 공간 아래의 방들을 나누는 가로 벽의 y. 문은 ROOM_DOORS 칸에 있다 */
const ROOM_WALL_Y = 11
/** 서버실(왼쪽)과 회의실(오른쪽)을 나누는 세로 벽의 x */
const ROOM_SPLIT_X = 4
const ROOM_DOORS = [2, 11]
export const SERVER_ROOM = { x: 0, y: ROOM_WALL_Y + 1, right: ROOM_SPLIT_X - 1, bottom: ROWS - 1 }
export const MEETING_ROOM = { x: ROOM_SPLIT_X + 1, y: ROOM_WALL_Y + 1, right: PARTITION_X - 1, bottom: ROWS - 1 }

/** CEO방 안쪽 (벽 제외). 왼쪽 벽은 x-1, 아래 벽은 bottom+1 줄에 있고 문은 아래 벽의 DOOR_X */
export const CEO_ROOM = { x: 21, y: 2, right: 25, bottom: 6 }
const CEO_DOOR_X = 23
export const CEO_DESK: Desk = { x: 22, y: 3, seat: { x: 22, y: 4 } }
/** 일반 책상 뒤에 CEO 책상을 붙인 전체 목록. CEO 책상의 번호는 DESKS.length */
export const ALL_DESKS: Desk[] = [...DESKS, CEO_DESK]

/** 벽에 붙은 표지판. 글자는 키운 화면에 그려야 읽을 수 있어서 그림과 따로 둔다 */
export type Sign = { x: number; y: number; w: number; text: string; color: string; bg: string }

export const SIGNS: Sign[] = [
  { x: 14, y: 0, w: 3, text: 'CAFE', color: '#fff5e1', bg: '#6b4423' },
  // 업무 공간 문 바로 위 칸막이 벽
  { x: PARTITION_X, y: DOOR_ROWS[0] - 1, w: 1, text: '개발팀', color: '#ffffff', bg: '#2e6da4' },
  { x: CEO_DOOR_X - 2, y: CEO_ROOM.bottom + 1, w: 2, text: 'CEO', color: '#3a2a0a', bg: '#e8c65a' },
  { x: 0, y: ROOM_WALL_Y, w: 2, text: '서버실', color: '#d6f5e3', bg: '#1f3b2d' },
  { x: 6, y: ROOM_WALL_Y, w: 3, text: '회의실', color: '#ffffff', bg: '#5b4a8a' },
  { x: CEO_DOOR_X + 1, y: CEO_ROOM.bottom + 1, w: 2, text: '안주영 출입금지', color: '#ffffff', bg: '#c0392b' },
]

/** w, h는 차지하는 칸 수 (h는 기본 1) */
export type Furniture =
  | { kind: 'bookshelf' | 'boxes' | 'clock' | 'painting'; x: number; y: number }
  | { kind: 'plant' | 'cooler' | 'fridge' | 'counter' | 'sofa' | 'cafe'; x: number; y: number; w: number; h?: number }
  | { kind: 'table'; x: number; y: number; w: number; h?: number; shrimp?: boolean }
  /** 옆모습 소파. facing은 앉은 사람이 바라보는 쪽 */
  | { kind: 'sofaSide'; x: number; y: number; w: 1; h: number; facing: 'left' | 'right' }
  /** 1인용 소파. 두 칸을 차지하고 가운데에 하나 앉는다. 앉은 사람은 아래(탁자 쪽)를 본다 */
  | { kind: 'armchair'; x: number; y: number; w: 2 }
  /** 안마의자. 앉으면 몸이 떨린다 */
  | { kind: 'massage'; x: number; y: number; w: 1 }
  | { kind: 'pool'; x: number; y: number; w: 3; h: 2 }
  /** 서버랙. 불빛이 깜빡인다 */
  | { kind: 'server'; x: number; y: number; w: 1 }
  /** 회의 탁자. 둘레에 MEETING_SEATS 의자가 놓인다 */
  | { kind: 'meetingTable'; x: number; y: number; w: number; h?: number }

export const sizeOf = (f: Furniture) => ({ w: 'w' in f ? f.w : 1, h: 'h' in f ? (f.h ?? 1) : 1 })

/** 벽에 붙은 장식은 막지 않고, 바닥에 놓인 가구는 지나갈 수 없다 */
export const WALL_DECOR: Furniture[] = [
  { kind: 'bookshelf', x: 2, y: 0 },
  { kind: 'bookshelf', x: 7, y: 0 },
  { kind: 'clock', x: 11, y: 0 },
  { kind: 'clock', x: 18, y: 0 },
  { kind: 'painting', x: 22, y: 0 },
  { kind: 'bookshelf', x: 24, y: 0 },
]

/** 바닥에 깔린 것. 그 위로 걸어 다닐 수 있다 */
export type Rug = { x: number; y: number; w: number; text: string }

export const RUGS: Rug[] = [{ x: 14, y: 3, w: 3, text: 'WELCOME' }]

export const FLOOR_ITEMS: Furniture[] = [
  { kind: 'plant', x: 0, y: 2, w: 1 },
  { kind: 'boxes', x: 12, y: 2 },
  // 서버실: 아래쪽 벽에 붙은 서버랙
  { kind: 'server', x: 0, y: 14, w: 1 },
  { kind: 'server', x: 1, y: 14, w: 1 },
  { kind: 'server', x: 3, y: 14, w: 1 },
  // 회의실: 가운데 긴 탁자
  { kind: 'meetingTable', x: 7, y: 14, w: 4 },
  { kind: 'plant', x: 12, y: 15, w: 1 },
  // 휴게실: 왼쪽 위 카페, 가운데 양옆 소파와 탁자
  { kind: 'cafe', x: 14, y: 2, w: 3 },
  { kind: 'plant', x: 17, y: 2, w: 1 },
  { kind: 'cooler', x: 18, y: 2, w: 1 },
  { kind: 'fridge', x: 19, y: 2, w: 1 },
  { kind: 'armchair', x: 17, y: 9, w: 2 },
  { kind: 'sofaSide', x: 16, y: 10, w: 1, h: 2, facing: 'right' },
  { kind: 'table', x: 17, y: 10, w: 2, h: 2, shrimp: true },
  { kind: 'sofaSide', x: 19, y: 10, w: 1, h: 2, facing: 'left' },
  { kind: 'plant', x: 14, y: 15, w: 1 },
  // 휴게실 오른쪽: 안마의자 두 개, 당구대
  { kind: 'massage', x: 24, y: 11, w: 1 },
  { kind: 'massage', x: 25, y: 11, w: 1 },
  { kind: 'pool', x: 21, y: 13, w: 3, h: 2 },
  // CEO방
  { kind: 'plant', x: 21, y: 2, w: 1 },
  { kind: 'plant', x: 25, y: 2, w: 1 },
  { kind: 'sofa', x: 24, y: 6, w: 2 },
  { kind: 'plant', x: 25, y: 15, w: 1 },
]

/**
 * 끌어다 놓으면 앉을 수 있는 자리. x, y는 칸, fx, fy는 앉은 사람의 발 위치(픽셀),
 * baseY는 소파보다 나중에 그려지도록 하는 그리기 순서 값
 */
export type Seat = { x: number; y: number; facing: 'down' | 'left' | 'right'; fx: number; fy: number; baseY: number; massage?: boolean }

export const SEATS: Seat[] = FLOOR_ITEMS.flatMap((f): Seat[] => {
  const bottom = (f.y + sizeOf(f).h) * TILE
  if (f.kind === 'sofa') {
    return Array.from({ length: f.w }, (_, i) => ({ x: f.x + i, y: f.y, facing: 'down', fx: (f.x + i) * TILE + 8, fy: f.y * TILE + 12, baseY: bottom }))
  }
  if (f.kind === 'massage') return [{ x: f.x, y: f.y, facing: 'down', fx: f.x * TILE + 8, fy: f.y * TILE + 12, baseY: bottom, massage: true }]
  if (f.kind === 'armchair') return [{ x: f.x, y: f.y, facing: 'down', fx: f.x * TILE + TILE, fy: f.y * TILE + 12, baseY: bottom }]
  if (f.kind === 'sofaSide') {
    const fx = f.x * TILE + (f.facing === 'right' ? 10 : 6)
    return Array.from({ length: f.h }, (_, j) => ({ x: f.x, y: f.y + j, facing: f.facing, fx, fy: (f.y + j) * TILE + 12, baseY: bottom }))
  }
  return []
})

/**
 * 회의 의자. 탁자 위아래로 넷씩, 양 끝에 하나씩. 첫 자리(왼쪽 끝)는 회의를 여는 CEO 자리.
 * 이름표가 겹치지 않게 위아래 줄을 번갈아 한 칸씩 띄워 채운다
 */
/** 회의실은 4줄인데 의자, 탁자, 의자는 3줄이라 위아래 여백이 같도록 회의 가구와 앉은 사람을 반 칸 위로 그린다 */
export const MEETING_DY = -TILE / 2

export type MeetingSeat = { x: number; y: number; facing: 'down' | 'up' | 'left' | 'right' }

const TOP = (x: number): MeetingSeat => ({ x, y: 13, facing: 'down' })
const BOTTOM = (x: number): MeetingSeat => ({ x, y: 15, facing: 'up' })

export const MEETING_SEATS: MeetingSeat[] = [
  { x: 6, y: 14, facing: 'right' },
  TOP(7),
  BOTTOM(8),
  TOP(9),
  BOTTOM(10),
  { x: 11, y: 14, facing: 'left' },
  TOP(8),
  BOTTOM(7),
  TOP(10),
  BOTTOM(9),
]

/** 그 칸에 놓으면 앉는 자리. 1인용 소파는 두 칸 어디에 놓아도 앉는다 */
export function seatAt(p: Point): Seat | undefined {
  return SEATS.find((s) => s.y === p.y && (s.x === p.x || (isArmchairTile(s, p))))
}
const isArmchairTile = (s: Seat, p: Point) =>
  FLOOR_ITEMS.some((f) => f.kind === 'armchair' && f.x === s.x && f.y === s.y && p.x === f.x + 1)

export const inCeoRoom = (x: number, y: number) => x >= CEO_ROOM.x && x <= CEO_ROOM.right && y >= CEO_ROOM.y && y <= CEO_ROOM.bottom
const ceoWall = (x: number, y: number) =>
  (x === CEO_ROOM.x - 1 && y >= CEO_ROOM.y && y <= CEO_ROOM.bottom + 1) ||
  (y === CEO_ROOM.bottom + 1 && x >= CEO_ROOM.x && x <= CEO_ROOM.right && x !== CEO_DOOR_X)

const roomWall = (x: number, y: number) =>
  (y === ROOM_WALL_Y && x < PARTITION_X && !ROOM_DOORS.includes(x)) || (x === ROOM_SPLIT_X && y > ROOM_WALL_Y)

export const isWall = (x: number, y: number) =>
  y < 2 || (x === PARTITION_X && !DOOR_ROWS.includes(y)) || ceoWall(x, y) || roomWall(x, y)
export const inServerRoom = (x: number, y: number) => x >= SERVER_ROOM.x && x <= SERVER_ROOM.right && y >= SERVER_ROOM.y
export const inMeetingRoom = (x: number, y: number) => x >= MEETING_ROOM.x && x <= MEETING_ROOM.right && y >= MEETING_ROOM.y
export const inLounge = (x: number, y: number) => x > PARTITION_X && !inCeoRoom(x, y) && !isWall(x, y)

const blocked = new Set<string>()
const key = (x: number, y: number) => `${x},${y}`
// 맨 아래 줄은 이름표가 화면 밖으로 잘리므로 걸어 다니지 않는다. 회의실은 맨 아래 줄 의자까지 가야 해서 예외
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) if (isWall(x, y) || (y === ROWS - 1 && !inMeetingRoom(x, y))) blocked.add(key(x, y))
}
for (const d of ALL_DESKS) {
  blocked.add(key(d.x, d.y))
  blocked.add(key(d.x + 1, d.y))
}
for (const f of FLOOR_ITEMS) {
  const { w, h } = sizeOf(f)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) blocked.add(key(f.x + i, f.y + j))
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

/** 가장 가까운 걸을 수 있는 칸. 가구나 벽 위에 놓으면 그 옆 칸으로 옮긴다 */
export function nearestWalkable(p: Point): Point | null {
  const x = Math.min(COLS - 1, Math.max(0, p.x))
  const y = Math.min(ROWS - 1, Math.max(0, p.y))
  for (let r = 0; r < Math.max(COLS, ROWS); r++) {
    let best: Point | null = null
    let bestDist = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !walkable(x + dx, y + dy)) continue
        const dist = dx * dx + dy * dy
        if (dist < bestDist) {
          best = { x: x + dx, y: y + dy }
          bestDist = dist
        }
      }
    }
    if (best) return best
  }
  return null
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
