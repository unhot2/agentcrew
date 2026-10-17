# 오피스 그림 바꾸기

오피스 화면은 기본적으로 코드로 직접 그린 그림을 씁니다.
이 폴더에 그림 파일과 `manifest.json`을 넣으면 같은 이름의 그림만 그 파일로 바뀝니다.
manifest에 없는 그림(예: 컴퓨터)은 직접 그린 그림이 그대로 남습니다.

## 폴더 배치 (예시)

```
public/office/
  manifest.json
  kenney/roguelikeIndoor_transparent.png   ← Kenney Roguelike Indoor
  metrocity/Character Model.png            ← MetroCity 몸
  metrocity/Hair.png                       ← MetroCity 머리
  metrocity/Outfit1.png                    ← MetroCity 옷
```

## manifest.json 형식

```json
{
  "sprites": {
    "floorWork": { "src": "kenney/roguelikeIndoor_transparent.png", "x": 0, "y": 0, "w": 16, "h": 16 }
  },
  "characters": [
    {
      "layers": ["metrocity/Character Model.png", "metrocity/Outfit1.png", "metrocity/Hair.png"],
      "frameW": 32,
      "frameH": 32,
      "rows": { "down": 0, "left": 1, "right": 2, "up": 3 },
      "walk": [0, 1, 2, 3],
      "idle": 0
    }
  ]
}
```

- `src`는 이 폴더 기준 경로입니다.
- `x, y, w, h`는 그림 파일 안에서 잘라낼 영역(픽셀)입니다. 잘라낸 그림은 칸의 아랫변에 맞춰 놓입니다.
- `characters`는 여러 개를 넣으면 에이전트마다 차례로 돌려 씁니다. `layers`는 위 순서대로 겹쳐 그립니다.
- 위 숫자는 예시입니다. 실제 값은 받은 그림 파일의 배치를 보고 정해야 합니다.

## 바꿀 수 있는 그림 이름

| 이름 | 크기(칸) | 설명 |
|---|---|---|
| `floorWork` | 1×1 | 업무 공간 바닥 |
| `floorLounge` | 1×1 | 휴게실 바닥 |
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
