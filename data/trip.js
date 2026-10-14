// 여행 데이터 — 이 파일만 고치면 사이트가 바뀐다.
// 회의 후 갱신 절차는 docs/갱신-가이드.md 참고.
// 일행 실명·연락처·예약번호는 넣지 않는다 (공개 저장소).
//
// type: 집결 | 관광 | 식당 | 카페 | 숙소 | 해산
// move: 이전 장소에서 여기까지 오는 방법 (첫 항목은 생략)
//   mode: 도보 | 지하철 | 버스 | 택시 | 차량
// status: 확정 | 후보   (후보는 흐리게 표시)

window.TRIP = {
  title: "8인 서울 1박 2일",
  sample: true, // 실제 일정으로 바꾸면 false로 — 상단 "샘플" 배지가 사라진다
  dates: { start: "날짜 미정", end: "" },
  people: 8,
  updated: "2026-10-14",

  meetup: {
    time: "1일차 12:00",
    place: "안국역 1번 출구",
    lat: 37.5765, lng: 126.9854,
    note: "각자 이동해서 이곳에서 모인다. 늦으면 단톡방에 미리 알리기."
  },

  stay: {
    name: "종로·인사동 일대 숙소 (미정)",
    lat: 37.5735, lng: 126.9862,
    exact: false, // 에어비앤비처럼 개인 주소면 false — 지도에 동네 범위만 표시
    checkin: "1일차 16:00",
    checkout: "2일차 11:00",
    link: ""
  },

  days: [
    {
      day: 1,
      title: "고궁과 종로",
      items: [
        { time: "12:00", type: "집결", name: "안국역 1번 출구", lat: 37.5765, lng: 126.9854, status: "확정",
          note: "전원 모이면 출발" },
        { time: "12:30", type: "식당", name: "북촌 점심 (후보 정하기)", lat: 37.5800, lng: 126.9850, status: "후보",
          move: { mode: "도보", min: 5 }, reserve: "8명 예약 필요", cost: "1인 1.5만" },
        { time: "14:00", type: "관광", name: "경복궁", lat: 37.5796, lng: 126.9770, status: "확정",
          move: { mode: "도보", min: 15 }, cost: "1인 3천", note: "한복 입으면 무료 입장" },
        { time: "16:00", type: "관광", name: "북촌한옥마을", lat: 37.5826, lng: 126.9831, status: "확정",
          move: { mode: "도보", min: 15 }, note: "주민 거주지라 조용히" },
        { time: "17:30", type: "숙소", name: "숙소 체크인", lat: 37.5735, lng: 126.9862, status: "확정",
          move: { mode: "도보", min: 15 } },
        { time: "19:00", type: "식당", name: "광장시장", lat: 37.5701, lng: 126.9996, status: "확정",
          move: { mode: "지하철", detail: "1호선 종각 → 종로5가", min: 15 }, cost: "1인 2만", note: "빈대떡·육회" },
        { time: "21:00", type: "관광", name: "청계천 산책", lat: 37.5690, lng: 126.9900, status: "후보",
          move: { mode: "도보", min: 10 } }
      ]
    },
    {
      day: 2,
      title: "성수와 서울숲",
      items: [
        { time: "11:00", type: "숙소", name: "체크아웃", lat: 37.5735, lng: 126.9862, status: "확정",
          note: "짐은 들고 이동" },
        { time: "12:00", type: "식당", name: "성수 브런치 (후보 정하기)", lat: 37.5446, lng: 127.0557, status: "후보",
          move: { mode: "지하철", detail: "종로3가 → (5호선·2호선) → 성수", min: 35 }, reserve: "웨이팅 확인" },
        { time: "13:30", type: "관광", name: "서울숲", lat: 37.5444, lng: 127.0374, status: "확정",
          move: { mode: "도보", min: 20 } },
        { time: "15:30", type: "카페", name: "성수 카페거리", lat: 37.5430, lng: 127.0560, status: "확정",
          move: { mode: "도보", min: 20 } },
        { time: "17:00", type: "해산", name: "성수역", lat: 37.5446, lng: 127.0557, status: "확정",
          move: { mode: "도보", min: 5 }, note: "각자 귀가" }
      ]
    }
  ],

  transport: [
    "서울까지는 각자 이동, 1일차 12:00 안국역에서 집결",
    "시내 이동은 지하철과 도보 기준 (교통카드 충전해 오기)",
    "택시가 필요하면 4명씩 2대"
  ],

  pending: [
    "여행 날짜 확정",
    "숙소 예약 (8명 한 곳)",
    "1일차 점심, 2일차 브런치 식당"
  ],

  checklist: [
    "교통카드 (티머니·기후동행카드)",
    "보조배터리",
    "편한 신발 — 1일차 도보 많음"
  ]
};
