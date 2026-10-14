# 8인 서울 1박 2일

일정·동선·식당·교통을 한 페이지로 보여 주는 정적 사이트. GitHub Pages로 공유한다.

- 일정 데이터: [`data/trip.js`](data/trip.js) → `index.html` (지도·타임라인)
- 준비 현황 데이터: [`data/board.js`](data/board.js) → `plan.html` (결정 대기·예약 현황·후보 목록·회의 기록)
- 회의 후 갱신 절차: [`docs/갱신-가이드.md`](docs/갱신-가이드.md)
- 일행이 의견을 적을 노션 틀: [`docs/노션-틀.md`](docs/노션-틀.md)

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 페이지 뼈대 |
| `style.css` | 디자인 (휴대폰 우선, 다크 모드 지원) |
| `app.js` | `trip.js`를 읽어 지도·타임라인·목록을 그린다 |
| `data/trip.js` | 여행 데이터 |
| `plan.html`, `plan.js` | 준비 현황 페이지 |
| `data/board.js` | 준비 현황 데이터 (노션 정리 페이지를 옮긴 것) |

지도는 Leaflet + OpenStreetMap(키 불필요)이고, 장소마다 카카오맵 길찾기 링크를 붙인다.

## 공개 범위

공개 저장소라 링크를 아는 사람은 누구나 볼 수 있다. 검색엔진 노출은 `noindex`로 막았지만 비밀은 아니다.
**일행 실명·연락처·예약번호·개인 숙소 상세 주소는 넣지 않는다.** 숙소가 개인 주소면 `stay.exact: false`로 두어
지도에 동네 범위만 표시한다.

## 로컬에서 보기

```bash
python -m http.server 8792
```

그다음 `http://localhost:8792`를 연다. (`index.html`을 더블클릭해 `file://`로 열면 지도 타일이 막힐 수 있다.)
