// 앱 화면과 알림 예약. esbuild가 www/bundle.js로 묶는다(scripts/build.mjs).
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import L from "leaflet";
import { buildAlarms, startOf, endOf, itemKey, nowAndNext, untilText, leadText } from "./alarms.js";

const T = window.TRIP;
const NATIVE = Capacitor.isNativePlatform();
const CHANNEL = "trip-schedule";
const LEADS = [0, 5, 10, 30];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 시험용: ?now=2026-11-14T14:50 이면 그 시각(KST)으로 본다.
const nowParam = new URLSearchParams(location.search).get("now");
const nowOffset = nowParam ? new Date(`${nowParam}:00+09:00`).getTime() - Date.now() : 0;
const now = () => new Date(Date.now() + nowOffset);

// 설정 저장. 저장이 막혀도 기본값으로 동작한다.
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
};
let lead = store.get("lead", 10);
let disabled = new Set(store.get("disabled", []));

const kakaoTo = (it) => `https://map.kakao.com/link/to/${encodeURIComponent(it.name)},${it.lat},${it.lng}`;
const hhmm = (d) => d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
const WD = "일월화수목금토";
const mdw = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${m}/${d}(${WD[new Date(`${iso}T12:00:00+09:00`).getUTCDay()]})`; };
const todayIso = () => new Date(now().getTime() + 9 * 3600000).toISOString().slice(0, 10);
const MOVE_ICON = { 도보: "🚶", 지하철: "🚇", 버스: "🚌", 택시: "🚕", 차량: "🚗", KTX: "🚄" };

/* ---------- 상단 ---------- */
$("#title").textContent = T.title;
$("#dates").textContent = `${T.dates.start} – ${T.dates.end}`;

/* ---------- 지금/다음 카드 ---------- */
function renderNow() {
  const n = now();
  const { current, next, first, last } = nowAndNext(T, n);
  const card = $("#now-card");
  const nav = (e) => `<a class="pill-btn" href="${kakaoTo(e.item)}" target="_blank" rel="noopener">길찾기</a>
    <button class="pill-btn ghost" data-jump="${e.day.day}:${e.index}">일정 보기</button>`;
  if (current) {
    const end = current.end ? ` ~ ${current.item.end}` : "";
    card.innerHTML = `
      <div class="label"><span class="pulse"></span>지금 · ${current.day.day}일차</div>
      <h2>${esc(current.item.name)}</h2>
      <div class="when">${current.item.time}${end}</div>
      <div class="row">${nav(current)}</div>
      ${next ? `<div class="next">다음 <b>${next.item.time}</b> ${esc(next.item.name)} · ${untilText(next.start, n)}</div>` : ""}`;
  } else if (next) {
    const label = next === first ? "첫 일정까지" : "다음 일정";
    card.innerHTML = `
      <div class="label">${label} · ${untilText(next.start, n)}</div>
      <h2>${esc(next.item.name)}</h2>
      <div class="when">${next.day.day}일차 ${mdw(next.day.date)} ${next.item.time}${next.item.end ? ` ~ ${next.item.end}` : ""}${next.item.move ? ` · ${esc(next.item.move.mode)}${next.item.move.min ? ` ${next.item.move.min}분` : ""}` : ""}</div>
      <div class="row">${nav(next)}</div>`;
  } else {
    card.innerHTML = `
      <div class="label">여행 끝</div>
      <h2>수고하셨습니다 👋</h2>
      <div class="when">마지막 일정 ${last ? `${esc(last.item.name)} ${last.item.time}` : ""}</div>`;
  }
}

/* ---------- 일자 전환 ---------- */
let dayIdx = Math.max(0, T.days.findIndex((d) => d.date === todayIso()));
if (todayIso() > T.days[T.days.length - 1].date) dayIdx = T.days.length - 1;

function segHtml(sel) {
  return T.days.map((d, i) => `<button role="tab" data-i="${i}" aria-selected="${i === sel}">
    ${d.day}일차 <small>${mdw(d.date)} · ${esc(d.title)}</small></button>`).join("");
}
function renderSeg() { $("#day-seg").innerHTML = segHtml(dayIdx); }
$("#day-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  dayIdx = +b.dataset.i; renderSeg(); renderTimeline();
});

/* ---------- 타임라인 ---------- */
function renderTimeline() {
  const d = T.days[dayIdx];
  const n = now();
  const { current } = nowAndNext(T, n);
  $("#timeline").innerHTML = d.items.map((it, i) => {
    const start = startOf(d, it);
    const end = endOf(d, it);
    const isCur = current && current.day === d && current.index === i;
    const isPast = !isCur && (end || start) < n && start < n;
    const on = !disabled.has(itemKey(d, it));
    const mv = it.move ? `<p class="move">${MOVE_ICON[it.move.mode] || "➜"} ${esc(it.move.mode)}${it.move.detail ? ` · ${esc(it.move.detail)}` : ""}${it.move.min ? ` · ${it.move.min}분` : ""}</p>` : "";
    const extra = [it.reserve, it.cost].filter(Boolean).map(esc).join(" · ");
    return `<li class="tl${isCur ? " current" : ""}${isPast ? " past" : ""}" id="it-${d.day}-${i}" style="--tc: var(--t-${esc(it.type)}, var(--accent))">
      <div class="time"><b>${it.time}</b>${it.end ? `<span>~${it.end}</span>` : ""}</div>
      <span class="node"></span>
      <div class="card">
        ${mv}
        <span class="chip">${esc(it.type)}</span>${it.status === "후보" ? `<span class="chip cand">후보</span>` : ""}
        <div class="head"><h3>${esc(it.name)}</h3></div>
        ${it.note ? `<p class="note">${esc(it.note)}</p>` : ""}
        ${extra ? `<p class="meta">${extra}</p>` : ""}
        <div class="actions">
          <a href="${kakaoTo(it)}" target="_blank" rel="noopener">길찾기</a>
          <button class="bell-toggle" data-key="${esc(itemKey(d, it))}" aria-pressed="${on}" aria-label="이 일정 알림 ${on ? "끄기" : "켜기"}">🔔 알림</button>
        </div>
      </div>
    </li>`;
  }).join("");
}
$("#timeline").addEventListener("click", (e) => {
  const b = e.target.closest(".bell-toggle"); if (!b) return;
  const k = b.dataset.key;
  if (disabled.has(k)) disabled.delete(k); else disabled.add(k);
  store.set("disabled", [...disabled]);
  renderTimeline();
  schedule();
});

function jumpTo(day, index) {
  showView("plan");
  dayIdx = Math.max(0, T.days.findIndex((d) => d.day === day));
  renderSeg(); renderTimeline();
  const el = document.getElementById(`it-${day}-${index}`);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); }
}
$("#now-card").addEventListener("click", (e) => {
  const b = e.target.closest("[data-jump]"); if (!b) return;
  const [day, idx] = b.dataset.jump.split(":").map(Number);
  jumpTo(day, idx);
});

/* ---------- 지도 ---------- */
let map, mapLayer, mapDay = dayIdx;
function renderMap() {
  $("#map-seg").innerHTML = segHtml(mapDay);
  if (!map) {
    map = L.map("map", { zoomControl: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
  }
  mapLayer.clearLayers();
  const d = T.days[mapDay];
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4f46e5";
  const pts = d.items.map((it) => [it.lat, it.lng]);
  L.polyline(pts, { color, weight: 4, opacity: .7, dashArray: "6 8" }).addTo(mapLayer);
  d.items.forEach((it, i) => {
    const icon = L.divIcon({
      className: "", iconSize: [28, 28], iconAnchor: [14, 28],
      html: `<div class="pin" style="background: var(--t-${esc(it.type)}, ${color})"><span>${i + 1}</span></div>`,
    });
    L.marker([it.lat, it.lng], { icon }).addTo(mapLayer)
      .bindPopup(`<b>${i + 1}. ${it.time} ${esc(it.name)}</b><br><a href="${kakaoTo(it)}" target="_blank" rel="noopener">카카오맵 길찾기</a>`);
  });
  setTimeout(() => { map.invalidateSize(); map.fitBounds(pts, { padding: [36, 36] }); }, 0);
}
$("#map-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  mapDay = +b.dataset.i; renderMap();
});

/* ---------- 정보 ---------- */
function renderInfo() {
  const s = T.stay || {};
  const list = (arr) => `<ul>${arr.map((x) => `<li>${esc(typeof x === "string" ? x : x.text || x.name || JSON.stringify(x))}</li>`).join("")}</ul>`;
  const parts = [];
  if (T.meetup) parts.push(`<div class="info-card"><h2>집결</h2><p><b>${esc(T.meetup.time)}</b> · ${esc(T.meetup.place)}</p><p class="muted">${esc(T.meetup.note)}</p></div>`);
  if (s.name) parts.push(`<div class="info-card"><h2>숙소</h2><p><b>${esc(s.name)}</b></p><p class="muted">체크인 ${esc(s.checkin)}<br>체크아웃 ${esc(s.checkout)}</p></div>`);
  if (Array.isArray(T.transport) && T.transport.length) parts.push(`<div class="info-card"><h2>교통</h2>${list(T.transport)}</div>`);
  if (Array.isArray(T.pending) && T.pending.length) parts.push(`<div class="info-card"><h2>아직 정할 것</h2>${list(T.pending)}</div>`);
  if (Array.isArray(T.checklist) && T.checklist.length) parts.push(`<div class="info-card"><h2>준비물</h2>${list(T.checklist)}</div>`);
  parts.push(`<div class="info-card"><h2>웹 페이지</h2><p class="muted">일정이 바뀌면 웹 페이지가 먼저 바뀝니다. 준비 현황도 웹에서 봅니다.</p>
    <a class="btn secondary" href="https://saltlake00.github.io/seoul-trip/" target="_blank" rel="noopener">웹 일정표 열기</a></div>`);
  parts.push(`<p class="muted small">데이터 갱신 ${esc(T.updated)}</p>`);
  $("#info").innerHTML = parts.join("");
}

/* ---------- 화면 전환 ---------- */
function showView(v) {
  for (const b of document.querySelectorAll(".tabbar button")) {
    if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  for (const s of document.querySelectorAll(".view")) s.hidden = s.id !== `view-${v}`;
  if (v === "map") renderMap();
  if (v === "info") renderInfo();
  window.scrollTo(0, 0);
}
document.querySelector(".tabbar").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (b) showView(b.dataset.view);
});

/* ---------- 알림 ---------- */
let perm = { display: "prompt", exact: "unknown" };
let channelOk = false; // 채널 생성에 실패하면 channelId 없이(플러그인 기본 채널) 예약한다. 없는 채널 id로 예약하면 안 뜬다.

async function ensurePermissions(ask) {
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted" && ask) p = await LocalNotifications.requestPermissions();
    perm.display = p.display;
  } catch { perm.display = "denied"; }
  if (NATIVE && Capacitor.getPlatform() === "android") {
    try { perm.exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch { perm.exact = "unknown"; }
    // 중요도 4(HIGH)=화면 위 팝업+소리. 채널 설정은 만든 뒤 같은 id로는 바뀌지 않는다.
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL, name: "일정 알림", description: "일정 출발·시작 알림", importance: 4, visibility: 1, vibration: true,
      });
      channelOk = true;
    } catch (err) { console.error("채널 생성 실패", err); channelOk = false; }
  }
  renderPerm();
}

function renderPerm() {
  const banner = $("#banner");
  const box = $("#perm-status");
  const dot = $("#bell-dot");
  if (perm.display !== "granted") {
    banner.hidden = false;
    banner.innerHTML = `<span>알림 권한이 꺼져 있어 일정 알림이 울리지 않습니다.</span><button id="ask-perm">켜기</button>`;
    box.className = "perm bad"; box.textContent = "알림 권한: 꺼짐";
    dot.hidden = false;
  } else if (perm.exact === "denied") {
    banner.hidden = false;
    banner.innerHTML = `<span>「알람 및 리마인더」가 꺼져 있으면 알림이 몇 분 늦을 수 있습니다.</span><button id="ask-exact">설정</button>`;
    box.className = "perm bad"; box.textContent = "정확한 시각 알림: 꺼짐 (늦게 울릴 수 있음)";
    dot.hidden = false;
  } else {
    banner.hidden = true;
    box.className = "perm"; box.textContent = NATIVE ? "알림 권한: 켜짐 · 정확한 시각 알림: 켜짐" : "브라우저 미리보기: 실제 알림은 앱에서만 예약됩니다.";
    dot.hidden = true;
  }
}
$("#banner").addEventListener("click", async (e) => {
  if (e.target.id === "ask-perm") {
    await ensurePermissions(true);
    if (perm.display !== "granted" && NATIVE) alert("휴대폰 설정 → 애플리케이션 → 서울 1박 2일 → 알림에서 켜 주세요.");
    schedule();
  }
  if (e.target.id === "ask-exact") {
    try { await LocalNotifications.changeExactNotificationSetting(); } catch { /* 설정 화면이 없는 버전 */ }
  }
});

let lastScheduled = [];
let schedState = "미리보기";
// 재예약을 한 줄로 세운다. 설정을 빠르게 바꿔도 앞 작업이 끝난 뒤 최신 설정으로 다시 한다(Codex 검토 5).
let chain = Promise.resolve();
function schedule() {
  chain = chain.then(doSchedule, doSchedule);
  return chain;
}
async function doSchedule() {
  const list = buildAlarms(T, { now: now(), lead, disabled });
  lastScheduled = list;
  if (!NATIVE) { schedState = "미리보기"; renderSched(); return; }
  if (perm.display !== "granted") { schedState = "권한 없음 — 예약 안 됨"; renderSched(); return; }
  try {
    // 앱이 예약한 것 전부(끈 항목·지난 설정 포함)를 지우고 새로 넣는다. 시험 알림(9999)은 남긴다.
    const pending = await LocalNotifications.getPending();
    const old = pending.notifications.filter((p) => p.id !== 9999);
    if (old.length) await LocalNotifications.cancel({ notifications: old.map((p) => ({ id: p.id })) });
    if (list.length) {
      await LocalNotifications.schedule({
        notifications: list.map((a) => ({
          id: a.id, title: a.title, body: a.body, largeBody: a.largeBody, extra: a.extra,
          ...(channelOk ? { channelId: CHANNEL } : {}),
          schedule: { at: a.at, allowWhileIdle: true },
        })),
      });
    }
    const after = await LocalNotifications.getPending();
    const n = after.notifications.filter((p) => p.id !== 9999).length;
    schedState = n === list.length ? `예약 확인 ${n}개` : `예약 불일치: 계산 ${list.length}개, 실제 ${n}개`;
  } catch (err) {
    console.error("알림 예약 실패", err);
    schedState = `예약 실패: ${err && err.message ? err.message : err}`;
  }
  renderSched();
}

function renderSched() {
  $("#sched-count").textContent = `${lastScheduled.length}개 · ${schedState}`;
  $("#sched-count").className = /실패|불일치|권한/.test(schedState) ? "bad-text" : "muted";
  $("#sched-list").innerHTML = lastScheduled.length
    ? lastScheduled.map((a) => `<li><b>${mdw(new Date(a.at.getTime() + 9 * 3600000).toISOString().slice(0, 10))} ${hhmm(a.at)}</b><span>${esc(a.title)}</span></li>`).join("")
    : `<li class="muted">남은 알림이 없습니다.</li>`;
}

function renderLeads() {
  $("#lead-chips").innerHTML = `<legend>언제 알릴까요</legend>` + LEADS.map((m) =>
    `<label><input type="radio" name="lead" value="${m}" ${m === lead ? "checked" : ""}>${m === 0 ? "딱 맞춰" : `${m}분 여유`}</label>`).join("");
}
$("#lead-chips").addEventListener("change", (e) => {
  lead = +e.target.value; store.set("lead", lead); schedule();
});

$("#test-alarm").addEventListener("click", async () => {
  if (!NATIVE) { alert("시험 알림은 설치한 앱에서만 됩니다."); return; }
  await ensurePermissions(true);
  if (perm.display !== "granted") { alert("알림 권한을 먼저 켜 주세요."); return; }
  const first = T.days[0].items[0];
  await LocalNotifications.schedule({
    notifications: [{
      id: 9999, title: `시험 · ${leadText(lead)} · ${first.name}`, body: "이렇게 일정 알림이 옵니다. 앱을 닫아 둬도 울립니다.",
      ...(channelOk ? { channelId: CHANNEL } : {}), schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true },
    }],
  });
  $("#test-alarm").textContent = "10초 뒤에 울립니다 — 앱을 닫아 보세요";
  setTimeout(() => { $("#test-alarm").textContent = "10초 뒤 시험 알림"; }, 12000);
});

$("#open-settings").addEventListener("click", () => { renderLeads(); renderSched(); $("#settings").showModal(); });

/* ---------- 시작 ---------- */
function renderAll() { renderNow(); renderSeg(); renderTimeline(); }
renderAll();
setInterval(() => { renderNow(); renderTimeline(); }, 30000);

(async () => {
  await ensurePermissions(true);
  await schedule();
})();

if (NATIVE) {
  // 알림을 누르면 그 일정으로 간다.
  LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
    const x = a.notification && a.notification.extra;
    if (x && x.day) jumpTo(x.day, x.index);
  });
  // 앱으로 돌아올 때 권한·예약을 다시 맞춘다(설정에서 권한을 바꾸고 온 경우).
  App.addListener("appStateChange", async ({ isActive }) => {
    if (!isActive) return;
    renderAll();
    await ensurePermissions(false);
    await schedule();
  });
  App.addListener("backButton", () => {
    if ($("#settings").open) $("#settings").close();
    else if (!$("#view-plan").hidden) App.minimizeApp();
    else showView("plan");
  });
}
