// 준비 현황 데이터 — 노션 「정리」 페이지를 옮긴 것. plan.html이 읽는다.
// 갱신 절차는 docs/갱신-가이드.md 참고.
// 공개 저장소다: 노션의 「담당」(사람 이름)은 옮기지 않는다.
//
// type: 관광 | 식당 | 카페 | 숙소
// day: 1 | 2 | null(미정)
// status: 후보 | 투표 중 | 확정 | 제외
// reserve: 필수 | 권장 | 웨이팅 | 불필요 | 확인 필요
// seats8: 가능 | 나눠 앉기 | 불가 | 확인 필요
// reserveStatus: 미예약 | 대기 중 | 예약 완료 | 취소
// open: 예약이 열리는 날 "YYYY-MM-DD"

window.BOARD = {
  sample: true, // 후보 목록이 샘플이다 — 노션 후보 목록이 채워지면 false
  tripStart: "2026-11-14",
  updated: "2026-10-14",

  pending: [
    { text: "집결 장소·시간 (각자 도착 시간 보고 정하기)", done: false },
    { text: "숙소 예약 (8명 한 곳)", done: false },
    { text: "1일차 점심·저녁 식당", done: false },
    { text: "2일차 점심 식당", done: false }
  ],

  candidates: [
    { name: "경복궁", type: "관광", day: 1, slot: "오후", status: "확정", votes: 6 },
    { name: "북촌한옥마을", type: "관광", day: 1, slot: "오후", status: "확정", votes: 4 },
    { name: "북촌 한식당 (가게 미정)", type: "식당", day: 1, slot: "점심", status: "투표 중", votes: 3,
      reserve: "권장", seats8: "확인 필요", method: "네이버 예약", reserveStatus: "미예약", budget: 15000 },
    { name: "광장시장", type: "식당", day: 1, slot: "저녁", status: "확정", votes: 5,
      reserve: "웨이팅", seats8: "나눠 앉기", method: "현장", budget: 20000, note: "빈대떡·육회, 4명씩 나눠 앉기" },
    { name: "을지로 고깃집 (가게 미정)", type: "식당", day: 1, slot: "저녁", status: "후보", votes: 2,
      reserve: "필수", seats8: "확인 필요", method: "캐치테이블", open: "2026-10-31", reserveStatus: "미예약",
      note: "광장시장과 둘 중 하나" },
    { name: "종로·인사동 숙소 (미정)", type: "숙소", day: 1, slot: "밤", status: "투표 중", votes: 4,
      reserve: "필수", seats8: "확인 필요", reserveStatus: "미예약", budget: 50000 },
    { name: "성수 브런치 (가게 미정)", type: "식당", day: 2, slot: "점심", status: "투표 중", votes: 4,
      reserve: "필수", seats8: "가능", method: "캐치테이블", open: "2026-10-24", reserveStatus: "미예약" },
    { name: "서울숲", type: "관광", day: 2, slot: "오후", status: "확정", votes: 3 },
    { name: "성수 카페거리", type: "카페", day: 2, slot: "오후", status: "확정", votes: 3 },
    { name: "N서울타워", type: "관광", day: null, slot: "밤", status: "후보", votes: 2, note: "동선에서 멀어 투표 필요" },
    { name: "롯데월드", type: "관광", day: null, slot: "미정", status: "제외", votes: 1, note: "1박 2일에는 시간 부족" }
  ],

  meetings: [
    { no: 1, date: "2026-10-14", title: "날짜 확정", items: ["여행 날짜: 11월 14일(토) ~ 15일(일) 확정"] }
  ]
};
