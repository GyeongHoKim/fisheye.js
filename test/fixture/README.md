# Fixture layout

- **original/** – 원본 피쉬아이 이미지 (cam1_01..03, cam2_01..03).
- **rectilinear/** – 원근(직선) 투영.
  - **natural/** – 원본 focal length를 유지한 자연스러운 rectilinear 투영 (newFx = 991).
  - **manual_fx/** – 다양한 newFx 값으로 생성된 테스트 이미지 (육안 검토용).
    - **original/** – newFx = 991 (100%, 원본과 동일).
    - **120pct/** – newFx = 1189.2 (120%, 확대).
    - **80pct/** – newFx = 792.8 (80%, 약간 넓게).
    - **60pct/** – newFx = 594.6 (60%, 넓게).
    - **40pct/** – newFx = 396.4 (40%, 매우 넓게).
    - **20pct/** – newFx = 198.2 (20%, 극도로 넓게).
- **equirectangular/** – 등장방형(위도·경도) 투영.
  - **panorama/** – 360° 파노라마.
- **cylindrical/** – 원통형 투영 (향후 참조용).
  - **panorama/** – 원통 파노라마.

각 투영/방식 폴더 아래에는 소스별 파일명이 동일하게 유지됩니다 (예: `cam1_01.jpg`).

## 참조 이미지 및 test_cases.json 생성

Python 3 가상환경을 사용해 의존성을 설치한 뒤 스크립트를 실행합니다.

```bash
cd test/fixture
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python generate_test_cases.py
```

생성된 `test_cases.json`은 E2E 테스트(`test/e2e/fisheye.e2e.spec.ts`)에서 로드합니다.

## 폴더별 육안 확인 방법

같은 소스(예: `cam1_01.jpg`)를 **original**과 각 투영 폴더에서 열어 비교하면 된다.

| 폴더 | 확인 포인트 |
|------|-------------|
| **original/** | 원본 피쉬아이: 원형/풀프레임으로 휘어 보이고, 직선이 곡선으로 보인다. |
| **rectilinear/natural/** | 직선이 **직선**으로 보인다. 원본 focal length 유지로 **가장 자연스러운 결과**. 가장자리에 검은 테두리가 있을 수 있다. |
| **rectilinear/manual_fx/original/** | natural과 동일 (newFx = 991). |
| **rectilinear/manual_fx/120pct/** | 더 확대된 화면 (망원 렌즈 효과). stretching 더 적지만 FOV가 좁다. |
| **rectilinear/manual_fx/80pct/** | 약간 더 넓은 FOV. 약간의 stretching과 검은 테두리 감소. |
| **rectilinear/manual_fx/60pct/** | 넓은 FOV. 눈에 띄는 stretching, 검은 테두리 거의 없음. |
| **rectilinear/manual_fx/40pct/** | 매우 넓은 FOV. 심한 stretching, 검은 테두리 없음. |
| **rectilinear/manual_fx/20pct/** | 극도로 넓은 FOV. 극심한 stretching (거의 사용 불가). |
| **equirectangular/panorama/** | **위·아래 가장자리**가 검거나 찌그러져 있고, **가로가 세로의 2배**에 가까운 2:1 비율. 지도처럼 위도선은 가로 직선. |
| **cylindrical/panorama/** | **세로는 직선**, **수평선**(위·아래)은 휘어 보임. 가로로 길쭉한 파노라마. 왼쪽·오른쪽 끝이 이어지면 원통 한 바퀴. |

**추천 순서**: `original` → `rectilinear/natural`(가장 자연스러움) → `rectilinear/manual_fx/*`(다양한 FOV 비교) → `equirectangular/panorama`(2:1, 위아래 찌그러짐) → `cylindrical/panorama`(세로 직선, 수평선 휨).

## Manual Focal Length 테스트

`rectilinear/manual_fx/` 폴더는 다양한 `newFx` 값으로 생성된 테스트 이미지를 포함합니다. 육안으로 비교하여 최적의 focal length를 찾기 위한 용도입니다.

### newFx 값에 따른 특징

- **original (100%)**: 원본 focal length 유지 → 가장 자연스러운 결과
- **120pct (120%)**: 확대 → stretching 더 적지만 FOV 좁음
- **80pct (80%)**: 약간 넓게 → 약간의 stretching
- **60pct (60%)**: 넓게 → 눈에 띄는 stretching
- **40pct (40%)**: 매우 넓게 → 심한 stretching
- **20pct (20%)**: 극도로 넓게 → 극심한 stretching (사용 불가)

### 비교 가이드

1. **자연스러움 우선**: `original` 또는 `120pct` 추천
2. **넓은 영역 필요**: `80pct` 또는 `60pct` 고려
3. **최대 영역**: `40pct` 이하는 stretching이 심해 비추천

### 육안 검토 체크리스트

같은 이미지(예: `cam1_01.jpg`)를 여러 폴더에서 열어 비교:

- [ ] **직선 왜곡**: 건물, 문틀 등이 직선으로 보이는가?
- [ ] **비율**: 사람, 물체의 가로/세로 비율이 자연스러운가?
- [ ] **검은 테두리**: 가장자리 검은 영역이 허용 가능한가?
- [ ] **FOV**: 필요한 영역이 충분히 보이는가?
