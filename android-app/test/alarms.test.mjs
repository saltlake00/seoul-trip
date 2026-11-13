import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  buildAlarms, startOf, itemKey, nowAndNext, untilText, normalizeLeads, channelFor, TEST_ID,
  isCritical, departState, prepAlarm, PREP_ID, DEPART_SLOT, alarmId, withDepartures,
} from "../src/alarms.js";

// 실제 data/trip.js를 읽는다. 시험용 가짜 데이터가 아니라 날짜 누락 같은 데이터 실수도 잡는다.
// 시간대 독립은 TZ=UTC, America/New_York, Asia/Seoul 세 번 돌려 본다(CI도 같음).
const src = readFileSync(fileURLToPath(new URL("../../data/trip.js", import.meta.url)), "utf8");
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const TRIP = ctx.window.TRIP;
const items = TRIP.days.flatMap((d) => d.items.map((it) => ({ d, it })));
const total = items.length;
const withMove = items.filter(({ it }) => it.move && it.move.min).length;
const BEFORE = new Date("2026-11-13T00:00:00Z");
const kst = (s) => new Date(`${s}:00+09:00`);
const iso = (s) => kst(s).toISOString();
const of = (list, word) => list.filter((a) => a.title.includes(word));
const NOMERGE = { mergeMin: 0 };

test("모든 일자에 ISO 날짜가 있고 모든 항목의 시작 시각을 만든다", () => {
  for (const d of TRIP.days) {
    assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/, `${d.day}일차 date`);
    for (const it of d.items) assert.ok(startOf(d, it), `${d.day}일차 ${it.name}`);
  }
});

test("시작 시각 기준: 아리아(예약 17:30) 30·10분 전 → 17:00, 17:20", () => {
  const all = of(buildAlarms(TRIP, { now: BEFORE, leads: [30, 10], departAlarm: false, ...NOMERGE }), "아리아");
  assert.deepEqual(all.map((a) => a.at.toISOString()), [iso("2026-11-14T17:00"), iso("2026-11-14T17:20")]);
  assert.ok(all[0].title.endsWith("· 예약 17:30"), all[0].title);
});

test("본문에 출발 시각: 방탈출(15:00, 택시 30분) 30분 전 알림 → 「30분 전 · 14:30 출발」", () => {
  const a = of(buildAlarms(TRIP, { now: BEFORE, leads: [30], ...NOMERGE }), "괴담저장소")[0];
  assert.equal(a.at.toISOString(), iso("2026-11-14T14:30"));
  assert.ok(a.body.startsWith("30분 전 · 14:30 출발"), a.body);
  assert.ok(a.body.includes("1일차 11/14 15:00~16:20"), a.body);
});

test("시작 기준 알림이 출발 시각보다 늦으면 「출발 시각 지남」", () => {
  const a = of(buildAlarms(TRIP, { now: BEFORE, leads: [10], departAlarm: false, ...NOMERGE }), "아리아")[0];
  assert.ok(a.body.startsWith("10분 전 · 출발 시각 16:50 지남"), a.body);
});

test("출발 알림: 이동 있는 일정마다 출발 시각에 「지금 출발」, 같은 시각 시점이 있으면 빼기", () => {
  const all = buildAlarms(TRIP, { now: BEFORE, leads: [10], ...NOMERGE });
  // 이동 10분짜리는 「10분 전」 알림이 곧 출발 시각이라 출발 알림을 따로 만들지 않는다
  const move10 = items.filter(({ it }) => it.move && it.move.min === 10).length;
  assert.equal(all.length, total + withMove - move10);
  const dep = all.find((a) => a.title === "지금 출발 · 웨스틴 조선 서울 아리아 (뷔페)");
  assert.equal(dep.at.toISOString(), iso("2026-11-14T16:50"));
  assert.equal(dep.id % 10, DEPART_SLOT);
  // 방탈출은 이동 30분 → 30분 전 시점과 출발 시각이 같아 출발 알림을 따로 만들지 않는다
  assert.equal(of(buildAlarms(TRIP, { now: BEFORE, leads: [30], ...NOMERGE }), "괴담저장소").length, 1);
});

test("이동 없는 첫 일정 정각(lead 0): 12:18, 제목 「용산역 · 집결 12:18」, 본문 「지금」", () => {
  const a = buildAlarms(TRIP, { now: BEFORE, lead: 0, departAlarm: false, ...NOMERGE })[0];
  assert.equal(a.at.toISOString(), iso("2026-11-14T12:18"));
  assert.equal(a.title, "용산역 · 집결 12:18");
  assert.ok(a.body.startsWith("지금\n"), a.body);
});

test("id는 모두 다르고 시험·준비물 알림과 겹치지 않는다", () => {
  const all = buildAlarms(TRIP, { now: BEFORE, leads: normalizeLeads([0, 5, 10, 15, 20, 30, 45, 60, 90]), ...NOMERGE });
  assert.equal(new Set(all.map((a) => a.id)).size, all.length);
  for (const a of all) assert.ok(a.id >= 1000 && a.id !== TEST_ID && a.id !== PREP_ID);
  assert.notEqual(alarmId(TRIP.days[0], 0, 8), alarmId(TRIP.days[0], 0, DEPART_SLOT));
});

test("경계: 알림 시각 1분 전이면 남고, 같은 시각이면 빠진다(방탈출 10분 전 14:50)", () => {
  const opt = { leads: [10], departAlarm: false, ...NOMERGE };
  assert.equal(of(buildAlarms(TRIP, { now: kst("2026-11-14T14:49"), ...opt }), "괴담저장소").length, 1);
  assert.equal(of(buildAlarms(TRIP, { now: kst("2026-11-14T14:50"), ...opt }), "괴담저장소").length, 0);
});

test("자정 넘어(11/15 00:30)는 1일차가 모두 빠지고 2일차만 남는다", () => {
  const all = buildAlarms(TRIP, { now: kst("2026-11-15T00:30"), leads: [10], ...NOMERGE });
  assert.ok(all.length > 0);
  assert.ok(all.every((a) => a.extra.day === 2));
});

test("끈 항목은 시점 알림·출발 알림 모두 뺀다", () => {
  const d = TRIP.days[0];
  const disabled = new Set([itemKey(d, d.items[2])]);
  const all = buildAlarms(TRIP, { now: BEFORE, leads: [10], disabled, ...NOMERGE });
  assert.equal(of(all, "괴담저장소").length, 0);
});

test("9분 안에 몰린 알림은 묶는다(절전 9분 제한)", () => {
  const all = buildAlarms(TRIP, { now: BEFORE, leads: [30, 10] });
  for (let i = 1; i < all.length; i++) assert.ok(all[i].at - all[i - 1].at >= 9 * 60000, `${all[i - 1].title} → ${all[i].title}`);
  assert.ok(all.some((a) => a.body.includes("이어서")));
  assert.equal(new Set(all.map((a) => a.id)).size, all.length);
});

test("직접 입력 시점 정리: 문자열·중복·음수·너무 큰 값, 최대 9개", () => {
  assert.deepEqual(normalizeLeads(["15", 10, 10, -5, 9999, "abc", 0]), [15, 10, 0]);
  assert.equal(normalizeLeads([...Array(20).keys()]).length, 9);
});

test("알림 방식 채널: 조합마다 다른 id, 소리 끄면 무음 파일, 팝업이면 중요도 4", () => {
  const all = channelFor({ sound: true, vibrate: true, popup: true });
  assert.equal(all.id, "trip-111"); assert.equal(all.importance, 4); assert.equal(all.sound, undefined);
  const quiet = channelFor({ sound: false, vibrate: true, popup: false });
  assert.equal(quiet.id, "trip-010"); assert.equal(quiet.importance, 3); assert.equal(quiet.sound, "silence.wav");
  assert.equal(channelFor({ sound: false, vibrate: false, popup: false }).importance, 2);
});

test("놓치면 안 되는 일정: 집결·방탈출·아리아·연극", () => {
  const names = items.filter(({ it }) => isCritical(it)).map(({ it }) => it.name);
  for (const w of ["용산역", "괴담저장소", "아리아", "마피아게임"]) assert.ok(names.some((n) => n.includes(w)), w);
  assert.ok(!names.some((n) => n.includes("국립중앙박물관")));
});

test("출발 상태: 방탈출 14:20이면 10분 남음, 14:35면 5분 지남", () => {
  const d = TRIP.days[0]; const it = d.items.find((x) => x.name.includes("괴담저장소"));
  assert.equal(departState(d, it, kst("2026-11-14T14:20")).left, 10);
  assert.equal(departState(d, it, kst("2026-11-14T14:35")).late, 5);
  assert.equal(departState(d, d.items[0], kst("2026-11-14T10:00")), null);
});

test("준비물 알림: 첫 일정 3시간 전(09:18), 다 챙기면 없음, 시각 지나면 없음", () => {
  const a = prepAlarm(TRIP, { now: kst("2026-11-14T02:00") });
  assert.equal(a.at.toISOString(), iso("2026-11-14T09:18"));
  assert.equal(prepAlarm(TRIP, { now: kst("2026-11-14T02:00"), checked: new Set(TRIP.checklist) }), null);
  assert.equal(prepAlarm(TRIP, { now: kst("2026-11-14T09:30") }), null);
});

test("지금/다음: 15:30이면 방탈출 진행 중, 다음은 아리아", () => {
  const { current, next } = nowAndNext(TRIP, kst("2026-11-14T15:30"));
  assert.ok(current.item.name.includes("괴담저장소"));
  assert.ok(next.item.name.includes("아리아"));
});

test("남은 시간 문구", () => {
  const now = kst("2026-11-14T10:00");
  assert.equal(untilText(kst("2026-11-14T10:35"), now), "35분 뒤");
  assert.equal(untilText(kst("2026-11-14T12:18"), now), "2시간 18분 뒤");
});

test("팀 기차: 1일차 첫 일정 「광주 : 광주→용산」 10:17, 2일차 16:08 해산은 「광주 : 용산→광주」로 바뀜", () => {
  const before = TRIP.days[0].items.length;
  const T2 = withDepartures(TRIP);
  assert.equal(TRIP.days[0].items.length, before, "원본이 바뀌면 안 됨");
  const first = T2.days[0].items[0];
  assert.equal(first.name, "광주 : 광주→용산");
  assert.equal(first.time, "10:17");
  assert.ok(first.offMap && isCritical(first));
  assert.equal(T2.days[0].items.length, before + 1);
  const back = T2.days[1].items.filter((it) => it.time === "16:08");
  assert.equal(back.length, 1, "16:08은 하나만");
  assert.equal(back[0].name, "광주 : 용산→광주");
  assert.ok(!back[0].offMap);
  assert.equal(T2.days[1].items.length, TRIP.days[1].items.length);
  const al = of(buildAlarms(T2, { now: BEFORE, leads: [30, 10], ...NOMERGE }), "광주→용산");
  // 기차는 1시간 전이 항상 더해진다
  assert.deepEqual(al.map((a) => a.at.toISOString()), [iso("2026-11-14T09:17"), iso("2026-11-14T09:47"), iso("2026-11-14T10:07")]);
  const backAl = of(buildAlarms(T2, { now: BEFORE, leads: [30, 10], ...NOMERGE }), "용산→광주");
  assert.deepEqual(backAl.map((a) => a.at.toISOString()), [iso("2026-11-15T15:08"), iso("2026-11-15T15:38"), iso("2026-11-15T15:58")]);
  assert.ok(backAl[0].body.startsWith("60분 전"), backAl[0].body);
  assert.equal(al[0].title, "광주 : 광주→용산 / 출발 10:17");
  assert.equal(prepAlarm(T2, { now: kst("2026-11-14T02:00") }).at.toISOString(), iso("2026-11-14T07:17"));
  assert.equal(nowAndNext(T2, kst("2026-11-14T09:00")).next.item.time, "10:17");
});
