# 오피스 그림 바꾸기

오피스 화면은 기본적으로 코드로 직접 그린 그림을 씁니다.
이 폴더에 그림 파일과 `manifest.json`을 넣으면 같은 이름의 그림만 그 파일로 바뀝니다.
manifest에 없는 그림(예: 컴퓨터)은 직접 그린 그림이 그대로 남습니다.

## 지금 쓰는 에셋

- `MetroCity/`: [MetroCity - Free Top Down Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) (JIK-A-4, CC0)
  - 시트 한 줄에 32×32 프레임 24개: 앞(0~5), 왼쪽(6~11), 뒤(12~17), 오른쪽(18~23)
  - `Character Model.png`의 줄은 피부색(6), `Hairs.png`의 줄은 머리 모양(8), 옷은 파일마다 한 줄

## manifest.json 형식

```json
{
  "sprites": {
    "floorWork": { "src": "kenney/roguelikeIndoor_transparent.png", "x": 0, "y": 0, "w": 16, "h": 16 }
  },
  "characters": [
    {
      "layers": [
        { "src": "MetroCity/CharacterModel/Shadow.png", "still": true },
        { "src": "MetroCity/CharacterModel/Character Model.png", "row": 0 },
        { "src": "MetroCity/Outfits/Outfit3.png" },
        { "src": "MetroCity/Hair/Hairs.png", "row": 0 }
      ],
      "frameW": 32,
      "frameH": 32,
      "start": { "down": 0, "left": 6, "up": 12, "right": 18 },
      "frames": 6,
      "idle": 0
    }
  ]
}
```

- `src`는 이 폴더 기준 경로입니다.
- `x, y, w, h`는 그림 파일 안에서 잘라낼 영역(픽셀)입니다. 잘라낸 그림은 칸의 아랫변에 맞춰 놓입니다.
- `characters`는 여러 개를 넣으면 에이전트마다 차례로 돌려 씁니다. `layers`는 위 순서대로 겹쳐 그립니다.
- `row`는 시트의 몇 번째 줄을 쓸지(피부색, 머리 모양 등), `still`은 프레임이 하나뿐인 그림(그림자)입니다.
- `start`는 방향별 첫 프레임의 열, `frames`는 방향마다 걷기 프레임 수, `idle`은 서 있을 때 쓰는 프레임입니다.

## 바꿀 수 있는 그림 이름

| 이름 | 크기(칸) | 설명 |
|---|---|---|
| `floorWork` | 1×1 | 업무 공간 바닥 |
| `floorLounge` | 1×1 | 휴게실 바닥 |
| `floorCeo` | 1×1 | CEO방 바닥 (카펫) |
| `wallTop`, `wall` | 1×1 | 위쪽 벽의 윗줄, 아랫줄 |
| `partition` | 1×1 | 업무 공간과 휴게실 사이 벽 |
| `bookshelf` | 2×2 | 벽 책장 |
| `clock`, `painting` | – | 벽 시계, 그림 액자 |
| `boxes`, `plant`, `cooler`, `fridge` | 1×1 | 바닥 소품 |
| `counter`, `table` | 2×1 | 조리대, 탁자 |
| `sofa` | 4×1 | 소파 |
| `desk` | 2×1 | 책상 |
| `monitorOn`, `monitorOff` | – | 켜진/꺼진 모니터 (책상 위) |
| `chair` | 1×1 | 의자 |

에셋 라이선스: Kenney Roguelike Indoor, MetroCity 모두 CC0입니다.
