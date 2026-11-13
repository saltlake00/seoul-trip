import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildAlarms, startOf, itemKey, nowAndNext, untilText, normalizeLeads, channelFor, TEST_ID, isCritical, departState, prepAlarm, PREP_ID } from "../src/alarms.js";

// 실제 data/trip.js를 읽는다. 시험용 가짜 데이터가 아니라 날짜 누락 같은 데이터 실수도 잡는다.
// 시간대 독립은 `npm run test:tz`(TZ=UTC, America/New_York, Asia/Seoul 세 번)로 본다.
const src = readFileSync(fileURLToPath(new URL("../../data/trip.js", import.meta.url)), "utf8");
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const TRIP = ctx.window.TRIP;
const total = TRIP.days.reduce((n, d) => n + d.items.length, 0);
const BEFORE = new Date("2026-11-13T00:00:00Z");
const kst = (s) => new Date(`${s}:00+09:00`);
const find = (list, word) => list.find((a) => a.title.includes(word));

test("모든 일자에 ISO 날짜가 있고 모든 항목의 시작 시각을 만든다", () => {
  for (const d of TRIP.days) {
    assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/, `${d.day}일차 date`);
    for (const it of d.items) assert.ok(startOf(d, it), `${d.day}일차 ${it.name}`);
  }
});

test("이동 시간이 있으면 출발 알림: 방탈출 15:00, 택시 30분, 여유 10분 → 14:20 KST(05:20Z)", () => {
  const a = find(buildAlarms(TRIP, { now: BEFORE, lead: 10, mergeMin: 0 }), "괴담저장소");
  assert.equal(a.at.toISOString(), "2026-11-14T05:20:00.000Z");
  assert.ok(a.title.startsWith("10분 뒤 출발"), a.title);
  assert.ok(a.body.startsWith("1일차 11/14 15:00~16:20"), a.body);
});

test("공연은 이동 시간만큼 앞당겨진다: 연극 19:30 알림이 19:20보다 이르다", () => {
  const a = find(buildAlarms(TRIP, { now: BEFORE, lead: 10, mergeMin: 0 }), "마피아게임");
  assert.ok(a.at < kst("2026-11-14T19:20"), a.at.toISOString());
});

test("이동 없는 첫 일정은 시작 기준: 정시(lead 0)면 12:18 KST, 「지금 시작」", () => {
  const a = buildAlarms(TRIP, { now: BEFORE, lead: 0, mergeMin: 0 })[0];
  assert.equal(a.at.toISOString(), "2026-11-14T03:18:00.000Z");
  assert.ok(a.title.startsWith("지금 시작 · 용산역"), a.title);
});

test("여행 전이면 모든 항목, id는 겹치지 않는다", () => {
  const all = buildAlarms(TRIP, { now: BEFORE, lead: 10, mergeMin: 0 });
  assert.equal(all.length, total);
  assert.equal(new Set(all.map((a) => a.id)).size, all.length);
  for (const a of all) assert.ok(a.id !== TEST_ID && a.id >= 1000, "시험 알림 id와 겹침");
});

test("경계: 알림 시각 1분 전이면 남고, 같은 시각이면 빠진다", () => {
  assert.ok(find(buildAlarms(TRIP, { now: kst("2026-11-14T14:19"), lead: 10 }), "괴담저장소"));
  assert.ok(!find(buildAlarms(TRIP, { now: kst("2026-11-14T14:20"), lead: 10 }), "괴담저장소"));
});

test("알림 시각은 지났지만 일정 시작 전이면 빠진다(14:40, 시작 15:00)", () => {
  assert.ok(!find(buildAlarms(TRIP, { now: kst("2026-11-14T14:40"), lead: 10 }), "괴담저장소"));
});

test("자정 넘어(11/15 00:30)는 1일차가 모두 빠지고 2일차는 모두 남는다", () => {
  const all = buildAlarms(TRIP, { now: kst("2026-11-15T00:30"), lead: 10, mergeMin: 0 });
  assert.equal(all.length, TRIP.days[1].items.length);
  assert.ok(all.every((a) => a.extra.day === 2));
});

test("끈 항목은 뺀다", () => {
  const d = TRIP.days[0];
  const disabled = new Set([itemKey(d, d.items[2])]);
  const all = buildAlarms(TRIP, { now: BEFORE, lead: 10, disabled, mergeMin: 0 });
  assert.equal(all.length, total - 1);
  assert.ok(!find(all, "괴담저장소"));
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

test("시점 여러 개(30·10분): 항목마다 두 개, id 모두 다름, 시각순", () => {
  const all = buildAlarms(TRIP, { now: BEFORE, leads: [10, 30], mergeMin: 0 });
  assert.equal(all.length, total * 2);
  assert.equal(new Set(all.map((a) => a.id)).size, all.length);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].at <= all[i].at);
  const esc = all.filter((a) => a.title.includes("괴담저장소")).map((a) => a.at.toISOString());
  assert.deepEqual(esc, ["2026-11-14T05:00:00.000Z", "2026-11-14T05:20:00.000Z"]);
});

test("직접 입력 시점 정리: 문자열·중복·음수·너무 큰 값", () => {
  assert.deepEqual(normalizeLeads(["15", 10, 10, -5, 9999, "abc", 0]), [15, 10, 0]);
  assert.equal(normalizeLeads([...Array(20).keys()]).length, 10);
});

test("알림 방식 채널: 조합마다 다른 id, 소리 끄면 무음 파일, 팝업이면 중요도 4", () => {
  const all = channelFor({ sound: true, vibrate: true, popup: true });
  assert.equal(all.id, "trip-111"); assert.equal(all.importance, 4); assert.equal(all.sound, undefined);
  const quiet = channelFor({ sound: false, vibrate: true, popup: false });
  assert.equal(quiet.id, "trip-010"); assert.equal(quiet.importance, 3); assert.equal(quiet.sound, "silence.wav");
  assert.equal(channelFor({ sound: false, vibrate: false, popup: false }).importance, 2);
});

test("놓치면 안 되는 일정: 집결·방탈출·아리아·연극·해산(KTX)", () => {
  const names = TRIP.days.flatMap((d) => d.items.filter(isCritical).map((it) => it.name));
  for (const w of ["용산역", "괴담저장소", "아리아", "마피아게임"]) assert.ok(names.some((n) => n.includes(w)), w);
  assert.ok(!names.some((n) => n.includes("국립중앙박물관")));
});

test("출발 상태: 방탈출(15:00, 택시 30분) 14:20이면 10분 남음, 14:35면 5분 지남", () => {
  const d = TRIP.days[0]; const it = d.items.find((x) => x.name.includes("괴담저장소"));
  assert.deepEqual([departState(d, it, kst("2026-11-14T14:20")).left, departState(d, it, kst("2026-11-14T14:20")).late], [10, 0]);
  assert.equal(departState(d, it, kst("2026-11-14T14:35")).late, 5);
  assert.equal(departState(d, d.items[0], kst("2026-11-14T10:00")), null);
});

test("준비물 알림: 첫 일정 3시간 전(09:18), 다 챙기면 없음, 시각 지나면 없음", () => {
  const a = prepAlarm(TRIP, { now: kst("2026-11-14T02:00") });
  assert.equal(a.at.toISOString(), "2026-11-14T00:18:00.000Z");
  assert.equal(a.id, PREP_ID);
  assert.equal(prepAlarm(TRIP, { now: kst("2026-11-14T02:00"), checked: new Set(TRIP.checklist) }), null);
  assert.equal(prepAlarm(TRIP, { now: kst("2026-11-14T09:30") }), null);
});

test("9분 안에 몰린 알림은 묶는다(절전 9분 제한): 12:08 용산역 + 12:15 점심 → 하나", () => {
  const all = buildAlarms(TRIP, { now: BEFORE, lead: 10 });
  const first = all[0];
  assert.ok(first.title.includes("용산역"), first.title);
  assert.ok(first.body.includes("이어서 12:15"), first.body);
  for (let i = 1; i < all.length; i++) assert.ok(all[i].at - all[i - 1].at >= 9 * 60000, `${all[i - 1].title} → ${all[i].title}`);
  assert.equal(new Set(all.map((a) => a.id)).size, all.length);
});
