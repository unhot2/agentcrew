/**
 * 직접 그린 픽셀 그림. 모든 좌표는 1배율 픽셀이고, 화면에 옮길 때 정수배로 키운다.
 * manifest.json에 같은 이름의 그림이 있으면 그 그림을 대신 쓴다 (assets.ts).
 */
import type { AdapterType } from '../types'
import type { ActivityKind } from './activity'
import type { OfficeAssets } from './assets'
import { ALL_DESKS, COLS, FLOOR_ITEMS, inCeoRoom, isWall, PARTITION_X, ROWS, RUGS, sizeOf, TILE, WALL_DECOR, type Furniture, type Rug } from './map'

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

/** CEO방 카펫 */
function floorCeo(ctx: Ctx, x: number, y: number) {
  r(ctx, x, y, TILE, TILE, '#3b5a8c')
  r(ctx, x + 3, y + 3, 2, 2, '#46679c')
  r(ctx, x + 11, y + 11, 2, 2, '#46679c')
  r(ctx, x + 11, y + 3, 1, 1, '#33507d')
  r(ctx, x + 3, y + 11, 1, 1, '#33507d')
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
      } else if (inCeoRoom(tx, ty)) {
        if (!override(ctx, assets, 'floorCeo', x, y + TILE)) floorCeo(ctx, x, y)
      } else if (tx >= PARTITION_X) {
        if (!override(ctx, assets, 'floorLounge', x, y + TILE)) floorLounge(ctx, x, y)
      } else if (!override(ctx, assets, 'floorWork', x, y + TILE)) floorWork(ctx, x, y, ty)
    }
  }
  for (const item of WALL_DECOR) drawFurniture(ctx, assets, item, 0)
  for (const rug of RUGS) if (!override(ctx, assets, 'rug', rug.x * TILE, (rug.y + 1) * TILE)) drawRug(ctx, rug)
}

/** 3~5칸 너비, 5칸 높이의 픽셀 글자 (#이 칠해진 칸) */
const FONT: Record<string, string[]> = {
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  E: ['###', '#..', '##.', '#..', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
}

function pixelText(ctx: Ctx, text: string, cx: number, y: number, color: string) {
  const glyphs = [...text].map((ch) => FONT[ch] ?? ['...', '...', '...', '...', '...'])
  const width = glyphs.reduce((sum, g) => sum + g[0].length, 0) + glyphs.length - 1
  let x = Math.round(cx - width / 2)
  for (const g of glyphs) {
    g.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '#') r(ctx, x + gx, y + gy, 1, 1, color)
    })
    x += g[0].length + 1
  }
}

/** 글자가 들어간 바닥 카펫 */
function drawRug(ctx: Ctx, rug: Rug) {
  const x = rug.x * TILE + 1
  const y = rug.y * TILE + 2
  const w = rug.w * TILE - 2
  r(ctx, x, y, w, 12, '#e8c65a')
  r(ctx, x + 1, y + 1, w - 2, 10, '#9c3b4a')
  r(ctx, x + 2, y + 2, w - 4, 8, '#8a3241')
  pixelText(ctx, rug.text, x + w / 2, y + 4, '#fff5e1')
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
  const bottom = (f.y + sizeOf(f).h) * TILE
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
      const h = (f.h ?? 1) * TILE
      // 위에서 내려다본 상판과 앞쪽 다리
      const top = bottom - h + 4
      r(ctx, x + 2, top, w - 4, h - 10, '#8a5a33')
      r(ctx, x + 2, top, w - 4, 1, '#a46c40')
      r(ctx, x + 2, bottom - 6, w - 4, 2, '#6e4527')
      r(ctx, x + 4, bottom - 4, 2, 4, '#5e3c20')
      r(ctx, x + w - 6, bottom - 4, 2, 4, '#5e3c20')
      if (f.shrimp) {
        shrimpPlate(ctx, x + w / 2 - 5, top + (h - 10) / 2)
        soju(ctx, x + w / 2 + 6, top + (h - 10) / 2)
      }
      else r(ctx, x + 12, bottom - 13, 4, 3, '#f5f5f5')
      return
    }
    case 'sofaSide': {
      const h = f.h * TILE
      const top = bottom - h
      // 등받이는 바라보는 쪽의 반대편에 둔다
      const backX = f.facing === 'right' ? x + 1 : x + 10
      const seatX = f.facing === 'right' ? x + 5 : x + 1
      r(ctx, seatX, top + 3, 10, h - 5, '#c46a7d')
      r(ctx, backX, top + 1, 5, h - 2, '#a9566a')
      r(ctx, seatX, top + 1, 10, 3, '#a9566a')
      r(ctx, seatX, bottom - 4, 10, 3, '#a9566a')
      r(ctx, seatX, top + h / 2, 10, 1, '#a9566a')
      return
    }
    case 'massage': {
      // 등받이가 높은 안마의자와 발받침, 팔걸이의 조작판
      r(ctx, x + 2, bottom - 22, 12, 12, '#3b3f4a')
      r(ctx, x + 3, bottom - 21, 10, 2, '#555b69')
      r(ctx, x + 4, bottom - 18, 8, 7, '#2c2f37')
      r(ctx, x + 3, bottom - 11, 10, 5, '#4a4f5c')
      r(ctx, x + 1, bottom - 14, 2, 8, '#3b3f4a')
      r(ctx, x + 13, bottom - 14, 2, 8, '#3b3f4a')
      r(ctx, x + 13, bottom - 14, 2, 2, frame % 2 ? '#5aa9e6' : '#2e86c1')
      r(ctx, x + 5, bottom - 6, 6, 5, '#2c2f37')
      r(ctx, x + 5, bottom - 6, 6, 1, '#555b69')
      return
    }
    case 'pool': {
      const w = f.w * TILE
      const h = f.h * TILE
      const top = bottom - h + 2
      // 나무 테두리, 초록 천, 구멍 여섯 개
      r(ctx, x + 1, top, w - 2, h - 6, '#6b4423')
      r(ctx, x + 4, top + 3, w - 8, h - 12, '#2e8b57')
      r(ctx, x + 5, top + 4, w - 10, 1, '#36a165')
      for (const px of [x + 3, x + w / 2 - 1, x + w - 5]) {
        r(ctx, px, top + 2, 2, 2, '#111')
        r(ctx, px, top + h - 11, 2, 2, '#111')
      }
      r(ctx, x + 3, bottom - 4, 3, 4, '#4a2e17')
      r(ctx, x + w - 6, bottom - 4, 3, 4, '#4a2e17')
      // 공과 큐대
      const balls: [number, number, string][] = [
        [30, 8, '#f5f5f5'], [12, 9, '#f1c40f'], [14, 12, '#c0392b'], [16, 9, '#2e86c1'], [16, 13, '#111'], [36, 14, '#8e44ad'],
      ]
      for (const [bx, by, color] of balls) r(ctx, x + bx, top + by, 2, 2, color)
      for (let i = 0; i < 14; i++) r(ctx, x + 22 + i, top + 18 - Math.floor(i / 3), 1, 1, i < 3 ? '#e8d5a8' : '#a0673a')
      return
    }
    case 'armchair': {
      // 두 칸 가운데에 놓인 CEO용 1인 소파 (등받이는 위쪽, 앉으면 탁자를 본다)
      const x0 = x + 7
      r(ctx, x0 + 1, bottom - 17, 16, 9, '#7a2e3a')
      r(ctx, x0 + 1, bottom - 17, 16, 1, '#e8c65a')
      r(ctx, x0 + 3, bottom - 9, 12, 7, '#9c3b4a')
      r(ctx, x0, bottom - 12, 3, 10, '#7a2e3a')
      r(ctx, x0 + 15, bottom - 12, 3, 10, '#7a2e3a')
      r(ctx, x0, bottom - 12, 3, 1, '#e8c65a')
      r(ctx, x0 + 15, bottom - 12, 3, 1, '#e8c65a')
      r(ctx, x0 + 8, bottom - 15, 2, 2, '#e8c65a')
      return
    }
    case 'cafe': {
      const w = f.w * TILE
      // 카운터 (상판, 앞판)
      r(ctx, x, bottom - 13, w, 13, '#6b4423')
      r(ctx, x, bottom - 13, w, 3, '#c8925d')
      r(ctx, x + 2, bottom - 8, w - 4, 1, '#55361c')
      // 에스프레소 머신
      r(ctx, x + 3, bottom - 24, 12, 11, '#b8c0c8')
      r(ctx, x + 3, bottom - 24, 12, 2, '#d8dee4')
      r(ctx, x + 5, bottom - 19, 8, 3, '#3a3a3a')
      r(ctx, x + 8, bottom - 16, 2, 2, '#6b4423')
      r(ctx, x + 12, bottom - 22, 2, 2, '#e05050')
      // 컵들
      for (let i = 0; i < 3; i++) {
        r(ctx, x + 19 + i * 5, bottom - 17, 4, 4, '#f5f5f5')
        r(ctx, x + 19 + i * 5, bottom - 17, 4, 1, '#7a4b2a')
      }
      // 케이크 진열장
      r(ctx, x + 35, bottom - 22, 11, 9, '#cfe8f2')
      r(ctx, x + 36, bottom - 17, 4, 3, '#f2d1a8')
      r(ctx, x + 36, bottom - 18, 4, 1, '#e86a8a')
      r(ctx, x + 41, bottom - 17, 4, 3, '#5a3a22')
      r(ctx, x + 35, bottom - 22, 11, 1, '#9fc4d4')
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

/** 접시에 담긴 새우 두 마리. (cx, cy)는 접시 가운데 */
function shrimpPlate(ctx: Ctx, cx: number, cy: number) {
  const x = Math.round(cx - 7)
  const y = Math.round(cy - 4)
  r(ctx, x + 1, y, 12, 8, '#f5f5f5')
  r(ctx, x, y + 1, 14, 6, '#f5f5f5')
  r(ctx, x + 1, y + 6, 12, 1, '#d9d9d9')
  // 구부러진 새우 몸통, 꼬리, 눈
  const shrimp = (sx: number, sy: number) => {
    r(ctx, sx, sy, 4, 1, '#f08a5d')
    r(ctx, sx + 3, sy + 1, 1, 2, '#f08a5d')
    r(ctx, sx, sy + 1, 1, 1, '#e86a4a')
    r(ctx, sx + 1, sy + 3, 3, 1, '#f08a5d')
    r(ctx, sx, sy + 3, 1, 1, '#c0392b')
    r(ctx, sx + 1, sy + 1, 2, 2, '#fbc3a3')
  }
  shrimp(x + 2, y + 2)
  shrimp(x + 8, y + 2)
}

/** 소주병과 소주잔. (x, cy)는 병의 왼쪽, 세로 가운데 */
function soju(ctx: Ctx, x: number, cy: number) {
  const bx = Math.round(x)
  const by = Math.round(cy - 6)
  r(ctx, bx + 1, by, 2, 2, '#1f7a3e')
  r(ctx, bx + 1, by - 1, 2, 1, '#2e9e5b')
  r(ctx, bx, by + 2, 4, 9, '#2e9e5b')
  r(ctx, bx, by + 2, 1, 9, '#5cc487')
  r(ctx, bx, by + 5, 4, 3, '#e8f5ec')
  r(ctx, bx + 1, by + 6, 2, 1, '#2e9e5b')
  // 잔
  r(ctx, bx + 6, by + 7, 3, 4, '#eef6f8')
  r(ctx, bx + 6, by + 8, 3, 2, '#d6ecf2')
}

function drawFurniture(ctx: Ctx, assets: OfficeAssets, f: Furniture, frame: number) {
  // 벽 장식은 벽 맨 아래(2번째 줄 아래)에 맞춘다
  const bottom = f.y < 2 ? 2 * TILE : (f.y + sizeOf(f).h) * TILE
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

/** 발에서 머리 꼭대기까지의 높이. 말풍선과 클릭 범위에 쓴다 */
export function characterHeight(assets: OfficeAssets, seated: boolean) {
  const sheet = assets.characters[0]
  if (sheet) return sheet.frameH - 2
  return seated ? 19 : 21
}

export function drawCharacter(ctx: Ctx, assets: OfficeAssets, index: number, pose: CharacterPose, frame: number, p: Palette) {
  const sheet = assets.characters.length ? assets.characters[index % assets.characters.length] : null
  if (sheet) {
    const dir = pose.seated ? 'up' : pose.dir
    const col = sheet.start[dir] + (pose.walking ? frame % sheet.frames : sheet.idle)
    const { frameW: w, frameH: h } = sheet
    // 프레임 맨 아래 줄이 발밑 그림자이므로 발 위치보다 조금 아래까지 내린다
    const dx = Math.round(pose.fx - w / 2)
    const dy = Math.round(pose.fy - h + 2)
    for (const l of sheet.layers) ctx.drawImage(l.img, l.still ? 0 : col * w, l.row * h, w, h, dx, dy, w, h)
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
  const items: Drawable[] = FLOOR_ITEMS.map((f) => ({ baseY: (f.y + sizeOf(f).h) * TILE - 1, draw: (ctx) => drawFurniture(ctx, assets, f, frame) }))
  ALL_DESKS.forEach((d, i) => {
    const x = d.x * TILE
    items.push({ baseY: (d.y + 1) * TILE - 1, draw: (ctx) => desk(ctx, assets, x, d.y * TILE, screenOn(i), frame) })
    // 의자는 앉은 사람보다 먼저 그린다
    items.push({ baseY: d.seat.y * TILE + 1, draw: (ctx) => override(ctx, assets, 'chair', x + 8, (d.seat.y + 1) * TILE) || chair(ctx, x, d.seat.y * TILE) })
  })
  return items
}
