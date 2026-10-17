/**
 * public/office/manifest.json이 있으면 그 그림 파일로 직접 그린 그림을 바꿔 끼운다.
 * 형식은 public/office/README.md 참고. 파일이 없거나 잘못됐으면 직접 그린 그림을 그대로 쓴다.
 */

export type SpriteRect = { img: HTMLImageElement; x: number; y: number; w: number; h: number }

export type CharacterSheet = {
  /** 같은 배치의 그림을 차례로 겹쳐 그린다 (몸, 옷, 머리 등) */
  layers: HTMLImageElement[]
  frameW: number
  frameH: number
  /** 방향별 줄 번호 */
  rows: Record<'down' | 'left' | 'right' | 'up', number>
  /** 걷기 프레임의 열 번호들 */
  walk: number[]
  /** 서 있을 때 열 번호 */
  idle: number
}

export type OfficeAssets = {
  sprites: Partial<Record<string, SpriteRect>>
  characters: CharacterSheet[]
}

export const EMPTY_ASSETS: OfficeAssets = { sprites: {}, characters: [] }

type ManifestRect = { src: string; x: number; y: number; w: number; h: number }
type ManifestCharacter = Omit<CharacterSheet, 'layers'> & { layers: string[] }
type Manifest = { sprites?: Record<string, ManifestRect>; characters?: ManifestCharacter[] }

const BASE = '/office/'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`그림을 불러오지 못했습니다: ${src}`))
    img.src = BASE + src
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
      (manifest.characters ?? []).map(async (c) => ({ ...c, layers: await Promise.all(c.layers.map(image)) })),
    )
    return { assets: { sprites, characters }, error: null }
  } catch (err) {
    return { assets: EMPTY_ASSETS, error: (err as Error).message }
  }
}
