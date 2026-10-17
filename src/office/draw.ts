/**
 * 직접 그린 픽셀 그림. 모든 좌표는 1배율 픽셀이고, 화면에 옮길 때 정수배로 키운다.
 * manifest.json에 같은 이름의 그림이 있으면 그 그림을 대신 쓴다 (assets.ts).
 */
import type { AdapterType } from '../types'
import type { ActivityKind } from './activity'
import type { OfficeAssets } from './assets'
import { COLS, DESKS, FLOOR_ITEMS, inLounge, isWall, PARTITION_X, ROWS, TILE, WALL_DECOR, type Furniture } from './map'

type Ctx = CanvasRenderingContext2D

function r(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** 바꿔 끼운 그림이 있으면 바닥선(bottom)에 맞춰 그리고 true */
function override(ctx: Ctx, assets: OfficeAssets, name: string, x: number, bottom: number) {
  const s = assets.sprites[name]
  if (!s) return false
  ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, bottom - s.h, s.w, s.h)
  return true
}

// ---------- 바닥과 벽 ----------

function floorWork(ctx: Ctx, x: number, y: number, row: number) {
  r(ctx, x, y, TILE, TILE, '#b9824e')
  r(ctx, x, y + 7, TILE, 1, '#a06d3f')
  r(ctx, x, y + 15, TILE, 1, '#a06d3f')
  r(ctx, x + ((row % 2) * 8 + 3), y, 1, 7, '#a06d3f')
  r(ctx, x + ((row % 2) * 8 + 11) % 16, y + 8, 1, 7, '#a06d3f')
  r(ctx, x + 1, y + 2, 4, 1, '#c8925d')
}

function floorLounge(ctx: Ctx, x: number, y: number) {
  r(ctx, x, y, TILE, TILE, '#ebe4d6')
  r(ctx, x + 15, y, 1, TILE, '#d9d0bf')
  r(ctx, x, y + 15, TILE, 1, '#d9d0bf')
  r(ctx, x + 7, y + 7, 2, 2, '#e0d8c8')
}

function wall(ctx: Ctx, x: number, y: number, row: number) {
  if (row === 0) {
    r(ctx, x, y, TILE, TILE, '#36415e')
    r(ctx, x, y, TILE, 4, '#232a3d')
  } else {
    r(ctx, x, y, TILE, TILE, '#3d4a6b')
    r(ctx, x, y + 13, TILE, 3, '#1c2232')
  }
}

function partition(ctx: Ctx, x: number, y: number) {
  r(ctx, x, y, TILE, TILE, '#2b3550')
  r(ctx, x + 2, y, TILE - 4, TILE, '#36415e')
}

export function drawBackground(ctx: Ctx, assets: OfficeAssets) {
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const x = tx * TILE
      const y = ty * TILE
      if (ty < 2) {
        if (!override(ctx, assets, ty === 0 ? 'wallTop' : 'wall', x, y + TILE)) wall(ctx, x, y, ty)
      } else if (isWall(tx, ty)) {
        if (!override(ctx, assets, 'partition', x, y + TILE)) partition(ctx, x, y)
      } else if (inLounge(tx) || tx === PARTITION_X) {
        if (!override(ctx, assets, 'floorLounge', x, y + TILE)) floorLounge(ctx, x, y)
      } else if (!override(ctx, assets, 'floorWork', x, y + TILE)) floorWork(ctx, x, y, ty)
    }
  }
  for (const item of WALL_DECOR) drawFurniture(ctx, assets, item, 0)
}

// ---------- 가구 ----------

const BOOKS = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1']

function bookshelf(ctx: Ctx, x: number, y: number) {
  r(ctx, x + 1, y + 3, 30, 27, '#6b4423')
  for (const sy of [5, 14, 23]) {
    r(ctx, x + 3, sy + y, 26, 7, '#4a2e17')
    for (let i = 0; i < 12; i++) {
      if ((i * 7 + sy) % 5 === 0) continue
      const h = 5 + ((i + sy) % 2)
      r(ctx, x + 4 + i * 2, y + sy + 7 - h, 2, h, BOOKS[(i * 3 + sy) % BOOKS.length])
    }
  }
}

function plant(ctx: Ctx, x: number, bottom: number) {
  r(ctx, x + 4, bottom - 6, 8, 6, '#c56b3c')
  r(ctx, x + 4, bottom - 6, 8, 1, '#a3532a')
  const leaves: [number, number, number][] = [
    [7, 18, 2], [4, 15, 2], [10, 15, 2], [2, 12, 3], [11, 12, 3], [6, 13, 4], [5, 10, 6], [7, 8, 2],
  ]
  for (const [lx, ly, w] of leaves) r(ctx, x + lx, bottom - ly + 2, w, 4, ly % 2 ? '#2f7a3a' : '#3f9b4b')
}

function drawFurnitureItem(ctx: Ctx, f: Furniture, frame: number) {
  const x = f.x * TILE
  const bottom = (f.y + 1) * TILE
  switch (f.kind) {
    case 'bookshelf':
      return bookshelf(ctx, x, f.y * TILE)
    case 'clock':
      r(ctx, x + 4, 5, 8, 8, '#e8e8e8')
      r(ctx, x + 3, 6, 10, 6, '#e8e8e8')
      r(ctx, x + 7, 7, 1, 3, '#222')
      r(ctx, x + 8, 9, 2, 1, '#222')
      return
    case 'painting':
      r(ctx, x - 6, 5, 28, 17, '#8a5a33')
      r(ctx, x - 4, 7, 24, 13, '#9ad0f0')
      r(ctx, x - 4, 15, 24, 5, '#5fae5a')
      r(ctx, x + 2, 12, 8, 4, '#4a8f47')
      r(ctx, x + 12, 9, 3, 3, '#f7d54a')
      return
    case 'boxes':
      r(ctx, x + 1, bottom - 8, 14, 8, '#c9a26b')
      r(ctx, x + 3, bottom - 15, 10, 7, '#d4b27e')
      r(ctx, x + 1, bottom - 5, 14, 1, '#a8834f')
      r(ctx, x + 7, bottom - 15, 2, 7, '#e3c999')
      return
    case 'plant':
      return plant(ctx, x, bottom)
    case 'cooler':
      r(ctx, x + 3, bottom - 14, 10, 14, '#d7dde4')
      r(ctx, x + 3, bottom - 14, 10, 1, '#eef2f5')
      r(ctx, x + 5, bottom - 10, 2, 2, '#e05050')
      r(ctx, x + 9, bottom - 10, 2, 2, '#4a90e2')
      r(ctx, x + 4, bottom - 24, 8, 10, '#8fc7e8')
      r(ctx, x + 5, bottom - 22 + (frame % 4 === 0 ? 1 : 0), 2, 2, '#c4e4f5')
      return
    case 'fridge':
      r(ctx, x + 1, bottom - 26, 14, 26, '#c4ccd4')
      r(ctx, x + 1, bottom - 17, 14, 1, '#9aa3ad')
      r(ctx, x + 12, bottom - 23, 1, 4, '#7d8690')
      r(ctx, x + 12, bottom - 14, 1, 6, '#7d8690')
      return
    case 'counter': {
      const w = f.w * TILE
      r(ctx, x, bottom - 14, w, 14, '#8f98a3')
      r(ctx, x, bottom - 14, w, 3, '#e6e6e6')
      r(ctx, x + 4, bottom - 22, 9, 8, '#3a3a3a')
      r(ctx, x + 6, bottom - 19, 5, 3, '#c0392b')
      r(ctx, x + 20, bottom - 17, 4, 3, '#f5f5f5')
      return
    }
    case 'table': {
      const w = f.w * TILE
      r(ctx, x + 2, bottom - 10, w - 4, 6, '#8a5a33')
      r(ctx, x + 2, bottom - 10, w - 4, 1, '#a46c40')
      r(ctx, x + 4, bottom - 4, 2, 4, '#5e3c20')
      r(ctx, x + w - 6, bottom - 4, 2, 4, '#5e3c20')
      r(ctx, x + 12, bottom - 13, 4, 3, '#f5f5f5')
      return
    }
    case 'sofa': {
      const w = f.w * TILE
      r(ctx, x + 1, bottom - 16, w - 2, 7, '#a9566a')
      r(ctx, x + 1, bottom - 9, w - 2, 7, '#c46a7d')
      r(ctx, x + 1, bottom - 16, 4, 14, '#a9566a')
      r(ctx, x + w - 5, bottom - 16, 4, 14, '#a9566a')
      for (let i = 1; i < f.w; i++) r(ctx, x + i * TILE, bottom - 9, 1, 6, '#a9566a')
      return
    }
  }
}

function drawFurniture(ctx: Ctx, assets: OfficeAssets, f: Furniture, frame: number) {
  // 벽 장식은 벽 맨 아래(2번째 줄 아래)에 맞춘다
  const bottom = f.y < 2 ? 2 * TILE : (f.y + 1) * TILE
  if (!override(ctx, assets, f.kind, f.x * TILE, bottom)) drawFurnitureItem(ctx, f, frame)
}

function desk(ctx: Ctx, assets: OfficeAssets, x: number, y: number, screenOn: boolean, frame: number) {
  const bottom = y + TILE
  if (!override(ctx, assets, 'desk', x, bottom)) {
    r(ctx, x, y + 2, 32, 8, '#a5703f')
    r(ctx, x, y + 2, 32, 1, '#c08850')
    r(ctx, x, y + 10, 32, 4, '#7c5230')
    r(ctx, x + 1, y + 14, 2, 2, '#5e3c20')
    r(ctx, x + 29, y + 14, 2, 2, '#5e3c20')
  }
  if (override(ctx, assets, screenOn ? 'monitorOn' : 'monitorOff', x + 9, y + 7)) return
  // 모니터와 키보드
  r(ctx, x + 9, y - 6, 14, 10, '#d4d8de')
  r(ctx, x + 10, y - 5, 12, 7, screenOn ? '#5aa9e6' : '#1f2633')
  if (screenOn) {
    // 화면 속 글자 줄이 조금씩 바뀐다
    for (let i = 0; i < 3; i++) r(ctx, x + 11, y - 4 + i * 2, 3 + ((frame + i * 3) % 7), 1, '#d6ecfb')
  }
  r(ctx, x + 15, y + 4, 2, 2, '#9aa0a8')
  r(ctx, x + 11, y + 7, 10, 2, '#e6e6e6')
  r(ctx, x + 26, y + 4, 3, 3, '#f5f5f5')
}

function chair(ctx: Ctx, x: number, y: number) {
  r(ctx, x + 11, y + 4, 10, 8, '#3a3f4b')
  r(ctx, x + 11, y + 4, 10, 1, '#565d6d')
  r(ctx, x + 15, y + 12, 2, 3, '#22262e')
}

// ---------- 캐릭터 ----------

export type Dir = 'down' | 'up' | 'left' | 'right'
export type Palette = { skin: string; hair: string; shirt: string; pants: string }

const SHIRT: Record<AdapterType, string> = {
  'claude-code': '#d97757',
  codex: '#3fa66b',
  hermes: '#7a5cc2',
  lmstudio: '#3d8fb8',
  ollama: '#5b5b5b',
}
const HAIR = ['#2b1d14', '#5a3a22', '#c58b3a', '#1d1d1d', '#8a4b2a', '#d9c27a']
const SKIN = ['#f2c9a0', '#e0ac7e', '#c68a5c', '#8d5a3b']
const PANTS = ['#2f3a56', '#3b3b3b', '#4a3b2a']

/** 셔츠 색은 어댑터, 머리와 피부색은 에이전트 id로 정해 늘 같은 모습이 되게 한다 */
export function paletteFor(id: string, adapter: AdapterType): Palette {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { shirt: SHIRT[adapter], hair: HAIR[h % HAIR.length], skin: SKIN[(h >> 4) % SKIN.length], pants: PANTS[(h >> 8) % PANTS.length] }
}

/** 발 가운데(fx, fy) 기준. frame 0~3, 걷지 않으면 0 */
function person(ctx: Ctx, fx: number, fy: number, dir: Dir, frame: number, walking: boolean, p: Palette) {
  r(ctx, fx - 4, fy - 1, 8, 2, 'rgba(0,0,0,0.25)')
  const step = walking ? frame % 4 : 0
  const bob = step === 1 || step === 3 ? -1 : 0
  const side = dir === 'left' || dir === 'right'
  // 다리
  if (side) {
    const spread = step === 1 ? 2 : step === 3 ? -2 : 0
    r(ctx, fx - 1 - spread, fy - 6, 2, 5, p.pants)
    r(ctx, fx - 1 + spread, fy - 6, 2, 5, p.pants)
    r(ctx, fx - 1 - spread, fy - 1, 2, 1, '#222')
    r(ctx, fx - 1 + spread, fy - 1, 2, 1, '#222')
  } else {
    r(ctx, fx - 3, fy - 6, 2, step === 1 ? 4 : 5, p.pants)
    r(ctx, fx + 1, fy - 6, 2, step === 3 ? 4 : 5, p.pants)
    r(ctx, fx - 3, fy - (step === 1 ? 2 : 1), 2, 1, '#222')
    r(ctx, fx + 1, fy - (step === 3 ? 2 : 1), 2, 1, '#222')
  }
  const top = fy + bob
  // 몸과 팔
  if (side) {
    r(ctx, fx - 3, top - 12, 6, 6, p.shirt)
    const swing = step === 1 ? 1 : step === 3 ? -1 : 0
    r(ctx, fx - 1 + (dir === 'right' ? swing : -swing), top - 11, 2, 5, p.shirt)
    r(ctx, fx - 1 + (dir === 'right' ? swing : -swing), top - 7, 2, 1, p.skin)
  } else {
    r(ctx, fx - 4, top - 12, 8, 6, p.shirt)
    const swing = step === 1 ? -1 : step === 3 ? 1 : 0
    r(ctx, fx - 5, top - 12 + swing, 1, 5, p.shirt)
    r(ctx, fx + 4, top - 12 - swing, 1, 5, p.shirt)
    r(ctx, fx - 5, top - 7 + swing, 1, 1, p.skin)
    r(ctx, fx + 4, top - 7 - swing, 1, 1, p.skin)
  }
  head(ctx, fx, top - 12, dir, p)
}

/** neck: 머리 아래쪽 y */
function head(ctx: Ctx, fx: number, neck: number, dir: Dir, p: Palette) {
  const y = neck - 7
  r(ctx, fx - 4, y, 8, 7, p.skin)
  if (dir === 'up') {
    r(ctx, fx - 4, y - 1, 8, 7, p.hair)
    return
  }
  r(ctx, fx - 4, y - 1, 8, 3, p.hair)
  if (dir === 'down') {
    r(ctx, fx - 4, y + 2, 1, 2, p.hair)
    r(ctx, fx + 3, y + 2, 1, 2, p.hair)
    r(ctx, fx - 2, y + 3, 1, 2, '#222')
    r(ctx, fx + 1, y + 3, 1, 2, '#222')
    return
  }
  const back = dir === 'right' ? fx - 4 : fx + 1
  r(ctx, back, y + 2, 3, 3, p.hair)
  r(ctx, dir === 'right' ? fx + 2 : fx - 3, y + 3, 1, 2, '#222')
}

/** 책상 앞에 앉은 뒷모습. typing이면 어깨가 번갈아 움직인다 */
function seated(ctx: Ctx, fx: number, fy: number, frame: number, typing: boolean, p: Palette) {
  const a = typing && frame % 2 === 0 ? 1 : 0
  r(ctx, fx - 4, fy - 11, 8, 6, p.shirt)
  r(ctx, fx - 5, fy - 11 + a, 1, 4, p.shirt)
  r(ctx, fx + 4, fy - 11 + (typing ? 1 - a : 0), 1, 4, p.shirt)
  head(ctx, fx, fy - 11, 'up', p)
}

export type CharacterPose = { fx: number; fy: number; dir: Dir; walking: boolean; seated: boolean; typing: boolean }

export function drawCharacter(ctx: Ctx, assets: OfficeAssets, index: number, pose: CharacterPose, frame: number, p: Palette) {
  const sheet = assets.characters.length ? assets.characters[index % assets.characters.length] : null
  if (sheet) {
    const dir = pose.seated ? 'up' : pose.dir
    const col = pose.walking ? sheet.walk[frame % sheet.walk.length] : sheet.idle
    const sx = col * sheet.frameW
    const sy = sheet.rows[dir] * sheet.frameH
    const dx = Math.round(pose.fx - sheet.frameW / 2)
    const dy = Math.round(pose.fy - sheet.frameH)
    for (const layer of sheet.layers) ctx.drawImage(layer, sx, sy, sheet.frameW, sheet.frameH, dx, dy, sheet.frameW, sheet.frameH)
    return
  }
  if (pose.seated) seated(ctx, pose.fx, pose.fy, frame, pose.typing, p)
  else person(ctx, pose.fx, pose.fy, pose.dir, frame, pose.walking, p)
}

// ---------- 말풍선 ----------

/** 5x5 글자. #이 칠해진 칸 */
const GLYPH: Partial<Record<ActivityKind, { rows: string[]; color: string }>> = {
  reading: { rows: ['####.', '#..#.', '####.', '#..#.', '####.'], color: '#2e86c1' },
  terminal: { rows: ['#....', '.#...', '#..##', '.....', '.....'], color: '#27ae60' },
  delegating: { rows: ['..#..', '...#.', '#####', '...#.', '..#..'], color: '#e67e22' },
  error: { rows: ['..#..', '..#..', '..#..', '.....', '..#..'], color: '#e04040' },
  paused: { rows: ['####.', '..#..', '.#...', '####.', '.....'], color: '#5b7fd1' },
  budget: { rows: ['.###.', '#.#..', '.###.', '..#.#', '.###.'], color: '#2e9e5b' },
}

export function drawBubble(ctx: Ctx, cx: number, top: number, kind: ActivityKind, frame: number) {
  if (kind === 'idle') return
  const x = Math.round(cx - 5)
  const y = Math.round(top - 9)
  r(ctx, x, y + 1, 11, 7, '#222')
  r(ctx, x + 1, y, 9, 9, '#222')
  r(ctx, x + 1, y + 1, 9, 7, '#ffffff')
  r(ctx, x + 4, y + 9, 2, 1, '#222')
  const glyph = GLYPH[kind]
  if (glyph) {
    glyph.rows.forEach((row, gy) => {
      for (let gx = 0; gx < 5; gx++) if (row[gx] === '#') r(ctx, x + 3 + gx, y + 2 + gy, 1, 1, glyph.color)
    })
    return
  }
  // 생각 중, 작성 중은 점이 하나씩 늘어난다
  const color = kind === 'typing' ? '#d97757' : '#888'
  const dots = (frame % 3) + 1
  for (let i = 0; i < dots; i++) r(ctx, x + 2 + i * 3, y + 4, 1, 1, color)
}

// ---------- 그리기 순서 ----------

export type Drawable = { baseY: number; draw: (ctx: Ctx) => void }

/** 바닥 위의 가구와 책상. 캐릭터와 함께 baseY 순서로 그린다 */
export function sceneItems(assets: OfficeAssets, screenOn: (deskIndex: number) => boolean, frame: number): Drawable[] {
  const items: Drawable[] = FLOOR_ITEMS.map((f) => ({ baseY: (f.y + 1) * TILE - 1, draw: (ctx) => drawFurniture(ctx, assets, f, frame) }))
  DESKS.forEach((d, i) => {
    const x = d.x * TILE
    items.push({ baseY: (d.y + 1) * TILE - 1, draw: (ctx) => desk(ctx, assets, x, d.y * TILE, screenOn(i), frame) })
    // 의자는 앉은 사람보다 먼저 그린다
    items.push({ baseY: d.seat.y * TILE + 1, draw: (ctx) => override(ctx, assets, 'chair', x + 8, (d.seat.y + 1) * TILE) || chair(ctx, x, d.seat.y * TILE) })
  })
  return items
}
