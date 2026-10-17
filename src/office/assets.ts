/**
 * public/office/manifest.json이 있으면 그 그림 파일로 직접 그린 그림을 바꿔 끼운다.
 * 형식은 public/office/README.md 참고. 파일이 없거나 잘못됐으면 직접 그린 그림을 그대로 쓴다.
 */

export type SpriteRect = { img: HTMLImageElement; x: number; y: number; w: number; h: number }

/** 시트 한 줄에 방향별 걷기 프레임이 이어 붙어 있는 배치 (MetroCity 등) */
export type CharacterSheet = {
  /** 차례로 겹쳐 그린다 (그림자, 몸, 옷, 머리 등) */
  layers: { img: HTMLImageElement; row: number; still: boolean }[]
  frameW: number
  frameH: number
  /** 방향별 첫 프레임의 열 번호 */
  start: Record<'down' | 'left' | 'right' | 'up', number>
  /** 방향마다 걷기 프레임 수 */
  frames: number
  /** 서 있을 때 쓰는 프레임 (방향 안에서의 순서) */
  idle: number
}

type ManifestLayer = {
  src: string
  /** 시트의 몇 번째 줄인지 (피부색, 머리 모양 등). 기본 0 */
  row?: number
  /** 프레임이 하나뿐인 그림 (그림자 등). 늘 첫 칸을 쓴다 */
  still?: boolean
}

export type OfficeAssets = {
  sprites: Partial<Record<string, SpriteRect>>
  characters: CharacterSheet[]
}

export const EMPTY_ASSETS: OfficeAssets = { sprites: {}, characters: [] }

type ManifestRect = { src: string; x: number; y: number; w: number; h: number }
type ManifestCharacter = Omit<CharacterSheet, 'layers'> & { layers: ManifestLayer[] }
type Manifest = { sprites?: Record<string, ManifestRect>; characters?: ManifestCharacter[] }

const BASE = '/office/'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`그림을 불러오지 못했습니다: ${src}`))
    img.src = BASE + encodeURI(src)
  })
}

export async function loadOfficeAssets(): Promise<{ assets: OfficeAssets; error: string | null }> {
  let manifest: Manifest
  try {
    const res = await fetch(`${BASE}manifest.json`)
    // 파일이 없으면 개발 서버가 index.html을 돌려주므로 JSON이 아니면 없는 것으로 본다
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { assets: EMPTY_ASSETS, error: null }
    manifest = await res.json()
  } catch {
    return { assets: EMPTY_ASSETS, error: 'public/office/manifest.json을 읽지 못했습니다. JSON 형식을 확인하세요.' }
  }

  const cache = new Map<string, Promise<HTMLImageElement>>()
  const image = (src: string) => {
    if (!cache.has(src)) cache.set(src, loadImage(src))
    return cache.get(src)!
  }

  try {
    const sprites: OfficeAssets['sprites'] = {}
    for (const [name, r] of Object.entries(manifest.sprites ?? {})) sprites[name] = { ...r, img: await image(r.src) }
    const characters = await Promise.all(
      (manifest.characters ?? []).map(async (c) => ({
        ...c,
        layers: await Promise.all(c.layers.map(async (l) => ({ img: await image(l.src), row: l.row ?? 0, still: !!l.still }))),
      })),
    )
    return { assets: { sprites, characters }, error: null }
  } catch (err) {
    return { assets: EMPTY_ASSETS, error: (err as Error).message }
  }
}
