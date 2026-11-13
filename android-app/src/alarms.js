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

// 알림 id: 일자*1000 + 순번*10 + 시점 칸(0~9). 앱 예약은 전부 1000 이상이고 시험 알림은 TEST_ID.
// 다시 예약할 때는 앱이 예약한 것 전부를 지우고 넣으므로 순번이 바뀌어도 남는 것이 없다.
export const TEST_ID = 1;
export const MAX_LEADS = 9; // 칸 9는 출발 알림(DEPART_SLOT)
export function alarmId(day, index, slot = 0) {
  return day.day * 1000 + index * 10 + slot;
}

// 알림 시점(분) 목록 정리: 0~600 사이 정수, 중복 제거, 큰 것부터, 최대 MAX_LEADS개.
export function normalizeLeads(leads) {
  const arr = (Array.isArray(leads) ? leads : [leads])
    .map((x) => Math.round(Number(x)))
    .filter((x) => Number.isFinite(x) && x >= 0 && x <= 600);
  return [...new Set(arr)].sort((a, b) => b - a).slice(0, MAX_LEADS);
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

// 알림 시각 = 시작 − lead분(시작 시각 기준, 사용자 요청 11-14 02:10).
// 이동이 있는 일정은 시작 기준 알림이 출발 시각보다 늦을 수 있어(예: 아리아 17:30, 택시 40분 → 출발 16:50)
// 출발 시각 알림을 따로 둔다(departAlarm). 공연·예약을 시작 10분 전에만 알리면 이미 늦는다(Codex 검토 13).
export function alarmTime(day, item, lead) {
  const start = startOf(day, item);
  if (!start) return null;
  const travel = item.move && item.move.min ? item.move.min : 0;
  return { start, travel, depart: travel ? new Date(start.getTime() - travel * 60000) : null, at: new Date(start.getTime() - lead * 60000) };
}

// 일정 시각에 붙는 말: 예약이면 「예약」, 집결·해산은 그대로, 나머지는 「시작」.
export function timeLabel(item) {
  if (item.reserve) return "예약";
  if (item.type === "집결" || item.type === "출발" || item.type === "해산") return item.type;
  return "시작";
}

// 알림 제목: 「웨스틴 조선 서울 아리아 (뷔페) · 예약 17:30」. lead는 본문 첫머리에 둔다.
export function alarmTitle(item) {
  // 기차는 사용자가 정한 꼴 「광주 : 광주→용산 / 출발 10:17」
  return `${item.name}${item.type === "출발" ? " / " : " · "}${timeLabel(item)} ${item.time}`;
}

// 예약할 알림 목록. trip: window.TRIP, now: Date, leads: 몇 분 전에 알릴지(여러 개), disabled: 끈 항목 키 Set.
// lead 하나만 넘겨도 된다(옛 호출). 지난 알림은 일정 시작이 아니라 「계산한 알림 시각」으로 거른다.
const hmKst = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16);

// 9분 안에 몰린 알림을 하나로 묶는다. allowWhileIdle 알림은 절전(Doze) 중 앱당 9분에 한 번만 울려
// 뒤의 것이 밀린다(Codex 2차 검토 3). 묶인 것은 앞 알림 본문에 「이어서 12:15 …」로 붙는다.
export function mergeClose(list, minutes = 9) {
  if (!minutes) return list;
  const out = [];
  for (const a of list) {
    const prev = out[out.length - 1];
    if (prev && a.at - prev.anchor < minutes * 60000) {
      prev.merged.push(a);
      const tail = `이어서 ${hmKst(a.at)} ${a.title}`;
      prev.body = `${prev.body}\n${tail}`;
      prev.largeBody = prev.body;
      continue;
    }
    out.push({ ...a, anchor: a.at, merged: [] });
  }
  return out.map(({ anchor, ...a }) => a);
}

// 출발 알림 칸(시점 칸 0~8 다음).
export const DEPART_SLOT = 9;
// 기차(type 「출발」)는 놓치면 끝이라 설정과 상관없이 1시간 전 알림을 더한다(사용자 요청 11-14 02:30).
export const TRAIN_EXTRA_LEADS = [60];
export function leadsFor(item, list) {
  return item.type === "출발" ? normalizeLeads([...TRAIN_EXTRA_LEADS, ...list]) : list;
}

// departAlarm: 이동이 있는 일정에 출발 시각 알림을 더할지(기본 켬).
export function buildAlarms(trip, { now = new Date(), leads, lead, disabled = new Set(), mergeMin = 9, departAlarm = true } = {}) {
  const list = normalizeLeads(leads ?? lead ?? 10);
  const out = [];
  for (const day of trip.days || []) {
    (day.items || []).forEach((item, i) => {
      if (disabled.has(itemKey(day, item))) return;
      const span = item.end ? `${item.time}~${item.end}` : item.time;
      const title = alarmTitle(item);
      // 늦게 도착한 알림(재부팅 복원 등)이 헷갈리지 않게 날짜와 절대 시각을 본문에 둔다.
      const when = `${day.day}일차 ${mdKst(day.date)} ${span}`;
      const tail = [when, item.note].filter(Boolean).join(" · ");
      const base = alarmTime(day, item, 0);
      if (!base) return;
      const departText = base.travel ? `${hmKst(base.depart)} 출발 (${moveText(item.move)})` : "";
      const mine = leadsFor(item, list);
      mine.forEach((ld, slot) => {
        const t = alarmTime(day, item, ld);
        if (t.at.getTime() <= now.getTime()) return;
        const head = ld === 0 ? "지금" : `${ld}분 전`;
        const late = t.travel && t.at > t.depart;
        const first = !t.travel ? head
          : late ? `${head} · 출발 시각 ${hmKst(t.depart)} 지남! 바로 이동 (${moveText(item.move)})`
          : `${head} · ${departText}`;
        const body = `${first}\n${tail}`;
        out.push({ id: alarmId(day, i, slot), title, body, largeBody: body, at: t.at, lead: ld, extra: { day: day.day, index: i } });
      });
      // 출발 알림: 출발 시각에. 시작 기준 알림이 이미 출발 시각에 울리면(같은 시각) 겹치지 않게 뺀다.
      if (departAlarm && base.travel && base.depart.getTime() > now.getTime()
        && !mine.some((ld) => ld === base.travel)) {
        const body = `${timeLabel(item)} ${item.time} · ${moveText(item.move)}\n${tail}`;
        out.push({ id: alarmId(day, i, DEPART_SLOT), title: `지금 출발 · ${item.name}`, body, largeBody: body, at: base.depart, lead: base.travel, depart: true, extra: { day: day.day, index: i } });
      }
    });
  }
  return mergeClose(out.sort((a, b) => a.at - b.at), mergeMin);
}

// 팀별 출발 기차(trip.departures)를 그날 첫 일정으로 끼운 사본을 돌려준다. 원본은 바꾸지 않는다.
// 끼운 항목은 type "출발", offMap(지도 제외). 시각순으로 다시 정렬한다.
export function withDepartures(trip) {
  const deps = trip.departures || [];
  if (!deps.length) return trip;
  const days = (trip.days || []).map((d) => {
    const mine = deps.filter((x) => x.date === d.date);
    if (!mine.length) return d;
    let items = d.items.slice();
    for (const x of mine) {
      const item = {
        time: x.time, end: x.end, type: "출발", name: `${x.team} : ${x.from}→${x.to}`,
        lat: x.lat, lng: x.lng, note: [x.train, x.note].filter(Boolean).join(" · "), offMap: !!x.offMap,
      };
      // 같은 시각 항목(올 때 16:08 해산)은 이 이름으로 바꿔 한 번만 보이게 한다.
      const same = items.findIndex((it) => it.time === x.time);
      if (same >= 0) items[same] = { ...items[same], ...item, offMap: false };
      else items.push(item);
    }
    items.sort((a, b) => a.time.localeCompare(b.time));
    return { ...d, items };
  });
  return { ...trip, days };
}

// 놓치면 안 되는 일정: 예약이 걸렸거나(reserve), 집결·출발·해산(기차), 메모에 「불가」「KTX」가 있는 것.
// 단체 여행에서 흔한 실수가 집결·출발 시각을 도착 시각으로 착각하는 것이라 화면에 따로 표시한다.
export function isCritical(item) {
  return !!(item.reserve || item.type === "집결" || item.type === "출발" || item.type === "해산" || /불가|KTX|기차/.test(item.note || ""));
}

// 출발 상태: 이동이 있는 일정의 출발 시각과 지금의 차이(분). 이동이 없으면 null.
// late>0 이면 출발 시각이 이미 지남.
export function departState(day, item, now) {
  const start = startOf(day, item);
  const travel = item.move && item.move.min ? item.move.min : 0;
  if (!start || !travel) return null;
  const depart = new Date(start.getTime() - travel * 60000);
  const diff = Math.round((depart - now) / 60000);
  return { depart, travel, left: Math.max(0, diff), late: Math.max(0, -diff) };
}

// 준비물 확인 알림: 첫 일정 3시간 전, 덜 챙긴 것이 있을 때만. checked: 챙긴 항목 Set.
export const PREP_ID = 2;
export function prepAlarm(trip, { now = new Date(), checked = new Set(), hoursBefore = 3 } = {}) {
  const items = (trip.checklist || []).filter((x) => !checked.has(x));
  const day = (trip.days || [])[0];
  const first = day && (day.items || [])[0];
  const start = first && startOf(day, first);
  if (!items.length || !start) return null;
  const at = new Date(start.getTime() - hoursBefore * 3600000);
  if (at <= now) return null;
  const body = items.join(" · ");
  return { id: PREP_ID, title: `준비물 확인 · ${items.length}개 남음`, body, largeBody: body, at, extra: { view: "info" } };
}

// 알림 방식(소리·진동·팝업) 조합마다 채널 하나. 안드로이드 채널은 만든 뒤 소리·진동·중요도를 바꿀 수 없어서
// 설정을 바꾸면 다른 채널로 예약한다. 소리 끔은 무음 파일(res/raw/silence.wav)을 채널 소리로 둔다.
export function channelFor({ sound = true, vibrate = true, popup = true } = {}) {
  const id = `trip-${sound ? 1 : 0}${vibrate ? 1 : 0}${popup ? 1 : 0}`;
  const parts = [sound && "소리", vibrate && "진동", popup && "팝업"].filter(Boolean);
  const importance = popup ? 4 : (sound || vibrate) ? 3 : 2;
  return {
    id,
    name: `일정 알림 (${parts.length ? parts.join("·") : "조용히"})`,
    description: "일정 출발·시작 알림",
    importance,
    visibility: 1,
    vibration: !!vibrate,
    ...(sound ? {} : { sound: "silence.wav" }),
  };
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
