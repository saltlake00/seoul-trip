// 일정 알림 시각 계산. 화면·Capacitor와 무관한 순수 함수라 node --test로 시험한다.
// 시각은 모두 KST(+09:00)로 박아 기기 시간대 설정과 무관하게 만든다.

export const KST = "+09:00";

// 일정 하나의 시작 시각(Date). date나 time이 없으면 null.
export function startOf(day, item) {
  if (!day || !day.date || !item || !/^\d{2}:\d{2}$/.test(item.time || "")) return null;
  const d = new Date(`${day.date}T${item.time}:00${KST}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function endOf(day, item) {
  if (!item || !item.end) return null;
  return startOf(day, { time: item.end });
}

// 알림 id: 일자*100 + 순번. 다시 예약할 때 같은 id를 cancel하고 schedule해 중복을 막는다.
export function alarmId(day, index) {
  return day.day * 100 + index;
}

// 항목 키: 끄기 설정을 저장할 때 쓴다. 순번이 바뀌어도 이름·시각이 같으면 같은 키.
export function itemKey(day, item) {
  return `${day.date}|${item.time}|${item.name}`;
}

function moveText(move) {
  if (!move) return "";
  const parts = [move.mode, move.detail, move.min ? `${move.min}분` : ""].filter(Boolean);
  return parts.join(" ");
}

export function leadText(lead) {
  return lead === 0 ? "지금" : `${lead}분 뒤`;
}

function mdKst(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

// 알림 시각. 이동 시간(move.min)이 있으면 「출발할 시각」 = 시작 − 이동 − 여유(lead),
// 없으면 「시작 lead분 전」. 공연·예약처럼 늦으면 안 되는 일정을 시작 10분 전에 알리면 이미 늦는다(Codex 검토 13).
export function alarmTime(day, item, lead) {
  const start = startOf(day, item);
  if (!start) return null;
  const travel = item.move && item.move.min ? item.move.min : 0;
  return { start, travel, at: new Date(start.getTime() - (travel + lead) * 60000) };
}

// 예약할 알림 목록. trip: window.TRIP, now: Date, lead: 여유 분, disabled: 끈 항목 키 Set.
// 지난 알림은 일정 시작이 아니라 「계산한 알림 시각」으로 거른다.
export function buildAlarms(trip, { now = new Date(), lead = 10, disabled = new Set() } = {}) {
  const out = [];
  for (const day of trip.days || []) {
    (day.items || []).forEach((item, i) => {
      const t = alarmTime(day, item, lead);
      if (!t) return;
      if (disabled.has(itemKey(day, item))) return;
      if (t.at.getTime() <= now.getTime()) return;
      const span = item.end ? `${item.time}~${item.end}` : item.time;
      const mv = moveText(item.move);
      // 늦게 도착한 알림(재부팅 복원 등)이 헷갈리지 않게 날짜와 절대 시각을 본문 앞에 둔다.
      const body = [`${day.day}일차 ${mdKst(day.date)} ${span}`, mv && `${mv} 이동`, item.note].filter(Boolean).join(" · ");
      const title = t.travel
        ? `출발할 시간 · ${item.name}`
        : `${leadText(lead)} 시작 · ${item.name}`;
      out.push({
        id: alarmId(day, i),
        title,
        body,
        largeBody: body,
        at: t.at,
        extra: { day: day.day, index: i },
      });
    });
  }
  return out;
}

// 지금 진행 중인 일정과 다음 일정. 화면 상단 카드에 쓴다.
export function nowAndNext(trip, now = new Date()) {
  const flat = [];
  for (const day of trip.days || []) {
    (day.items || []).forEach((item, i) => {
      const start = startOf(day, item);
      if (start) flat.push({ day, item, index: i, start, end: endOf(day, item) });
    });
  }
  flat.sort((a, b) => a.start - b.start);
  let current = null;
  let next = null;
  for (let k = 0; k < flat.length; k++) {
    const e = flat[k];
    // 끝 시각이 없으면 다음 일정 시작 전까지 진행 중으로 본다(마지막 항목은 30분).
    const until = e.end || (flat[k + 1] ? flat[k + 1].start : new Date(e.start.getTime() + 30 * 60000));
    if (e.start <= now && now < until) current = e;
    if (e.start > now && !next) next = e;
  }
  return { current, next, first: flat[0] || null, last: flat[flat.length - 1] || null };
}

// "35분 뒤", "1시간 5분 뒤", "2일 뒤"
export function untilText(target, now = new Date()) {
  let m = Math.round((target - now) / 60000);
  if (m <= 0) return "곧";
  if (m < 60) return `${m}분 뒤`;
  const h = Math.floor(m / 60);
  m %= 60;
  if (h < 24) return m ? `${h}시간 ${m}분 뒤` : `${h}시간 뒤`;
  return `${Math.floor(h / 24)}일 뒤`;
}
