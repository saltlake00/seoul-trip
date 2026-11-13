// 앱 화면과 알림 예약. esbuild가 www/bundle.js로 묶는다(scripts/build.mjs).
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { Geolocation } from "@capacitor/geolocation";
import L from "leaflet";
import {
  buildAlarms, startOf, endOf, itemKey, nowAndNext, untilText, normalizeLeads, channelFor, alarmTitle,
  isCritical, departState, prepAlarm, withDepartures, TEST_ID, MAX_LEADS,
} from "./alarms.js";

const T = withDepartures(window.TRIP); // 팀별 출발 기차를 그날 첫 일정으로 끼운 사본
const NATIVE = Capacitor.isNativePlatform();
// 기본 시점 칩. 직접 입력한 값은 칩으로 더해져 저장된다.
const PRESET_LEADS = [10, 30];
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
let leads = normalizeLeads(store.get("leads", [30, 10]));        // 고른 시점(분 전)
let leadOptions = normalizeLeads([...PRESET_LEADS, ...store.get("leadOptions", []), ...leads]); // 칩으로 보일 시점
let kinds = Object.assign({ sound: true, vibrate: true, popup: true }, store.get("kinds", {})); // 알림 방식
let departAlarm = store.get("departAlarm", true);                 // 이동 있는 일정은 출발 시각에도 알림
let disabled = new Set(store.get("disabled", []));
let checked = new Set(store.get("checked", []));                  // 챙긴 준비물

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
// 이동이 필요한 일정이면 「출발 14:30 (택시 30분) · 12분 남음」, 출발 시각이 지났으면 경고.
function departLine(e) {
  const st = departState(e.day, e.item, now());
  if (!st) return "";
  const mv = e.item.move;
  const tail = st.late
    ? ` <span class="late">출발 시각 ${st.late}분 지남</span>`
    : st.left <= 120 ? ` · ${st.left}분 남음` : "";
  return `<br><b>출발 ${hhmm(st.depart)}</b> (${esc(mv.mode)} ${mv.min}분)${tail}`;
}
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
      ${next ? `<div class="next">다음 <b>${next.item.time}</b> ${esc(next.item.name)} · ${untilText(next.start, n)}${departLine(next)}</div>` : ""}`;
  } else if (next) {
    const label = next === first ? "첫 일정까지" : "다음 일정";
    card.innerHTML = `
      <div class="label">${label} · ${untilText(next.start, n)}</div>
      <h2>${esc(next.item.name)}</h2>
      <div class="when">${next.day.day}일차 ${mdw(next.day.date)} ${next.item.time}${next.item.end ? ` ~ ${next.item.end}` : ""}${departLine(next)}</div>
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
        <span class="chip">${esc(it.type)}</span>${isCritical(it) ? `<span class="chip must">놓치면 안 됨</span>` : ""}${it.status === "후보" ? `<span class="chip cand">후보</span>` : ""}
        <div class="head"><h3>${esc(it.name)}</h3></div>
        ${it.note ? `<p class="note">${esc(it.note)}</p>` : ""}
        ${extra ? `<p class="meta">${extra}</p>` : ""}
        <div class="actions">
          <a href="${kakaoTo(it)}" target="_blank" rel="noopener">길찾기</a>
          ${isPast ? "" : switchHtml(itemKey(d, it), on)}
        </div>
      </div>
    </li>`;
  }).join("");
}

// 일정별 알림 스위치. 카드와 설정 화면의 「일정별 알림」 목록이 같은 것을 쓴다.
function switchHtml(key, on) {
  return `<label class="switch${on ? "" : " off"}"><input type="checkbox" data-key="${esc(key)}" ${on ? "checked" : ""}>
    <span class="track" aria-hidden="true"></span><span class="lbl">${on ? "알림 켬" : "알림 꺼짐"}</span></label>`;
}
function setItemAlarm(keys, on) {
  for (const k of keys) { if (on) disabled.delete(k); else disabled.add(k); }
  store.set("disabled", [...disabled]);
  renderTimeline();
  if ($("#settings").open) renderItemList();
  schedule();
}
$("#timeline").addEventListener("change", (e) => {
  const k = e.target.dataset.key; if (k == null) return;
  setItemAlarm([k], e.target.checked);
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
    // OSM 타일 서버는 앱(https://localhost) 요청을 막을 수 있어 키가 필요 없는 Esri 지도를 쓴다.
    // CARTO는 2026-11 확인 때 「API KEY REQUIRED」 타일을 돌려줬다.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Tiles © Esri",
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    map.on("dragstart", () => { followMe = false; }); // 손으로 지도를 옮기면 따라가기를 멈춘다
  }
  mapLayer.clearLayers();
  const d = T.days[mapDay];
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4f46e5";
  // 집에서 떠나는 기차(offMap)는 지도에서 뺀다 — 서울 동선 지도가 광주까지 넓어진다.
  const onMap = d.items.filter((it) => !it.offMap);
  const pts = onMap.map((it) => [it.lat, it.lng]);
  L.polyline(pts, { color: getComputedStyle(document.documentElement).getPropertyValue(`--day${(mapDay % 2) + 1}`).trim() || color, weight: 4, opacity: .7, dashArray: "6 8" }).addTo(mapLayer);
  onMap.forEach((it, i) => {
    const icon = L.divIcon({
      className: "", iconSize: [28, 28], iconAnchor: [14, 28],
      html: `<div class="pin" style="background: var(--t-${esc(it.type)}, ${color})"><span>${i + 1}</span></div>`,
    });
    L.marker([it.lat, it.lng], { icon }).addTo(mapLayer)
      .bindPopup(`<b>${i + 1}. ${it.time} ${esc(it.name)}</b><br><a href="${kakaoTo(it)}" target="_blank" rel="noopener">카카오맵 길찾기</a>`);
  });
  setTimeout(() => { map.invalidateSize(); map.fitBounds(pts, { padding: [36, 36] }); }, 0);
}
$("#info").addEventListener("change", (e) => {
  const k = e.target.dataset.check; if (k == null) return;
  if (e.target.checked) checked.add(k); else checked.delete(k);
  store.set("checked", [...checked]);
  renderInfo();
  schedule(); // 준비물 알림 내용·유무가 바뀐다
});
$("#map-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  mapDay = +b.dataset.i; renderMap();
});

/* 내 위치: 버튼을 누를 때만 권한을 묻고, 지도 탭에 있는 동안만 따라간다. 위치는 저장·전송하지 않는다. */
let meMarker = null, meCircle = null, watchId = null, followMe = false;
function showMe(lat, lng, acc) {
  if (!map) return;
  const ll = [lat, lng];
  if (!meMarker) {
    meCircle = L.circle(ll, { radius: acc, color: "#2563eb", weight: 1, fillColor: "#3b82f6", fillOpacity: .12 }).addTo(map);
    meMarker = L.marker(ll, { icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="me-dot"></div>` }), zIndexOffset: 1000 }).addTo(map);
  } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(acc); }
  if (followMe) map.setView(ll, Math.max(map.getZoom(), 16));
  $("#locate").classList.add("on");
}
function locErr(err) {
  const msg = /denied|permission/i.test(String(err && (err.message || err)))
    ? "위치 권한이 꺼져 있습니다. 설정 → 애플리케이션 → 서울 1박 2일 → 권한 → 위치를 허용해 주세요."
    : "위치를 찾지 못했습니다. GPS(위치)가 켜져 있는지 확인해 주세요.";
  $("#loc-note").textContent = msg; $("#loc-note").hidden = false;
  $("#locate").classList.remove("on", "busy");
}
async function startLocate() {
  $("#loc-note").hidden = true;
  $("#locate").classList.add("busy");
  followMe = true;
  try {
    if (NATIVE) {
      let p = await Geolocation.checkPermissions();
      if (p.location !== "granted" && p.coarseLocation !== "granted") p = await Geolocation.requestPermissions();
      if (p.location !== "granted" && p.coarseLocation !== "granted") throw new Error("permission denied");
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      showMe(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      if (watchId == null) {
        watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000 }, (pos2, err) => {
          if (pos2) showMe(pos2.coords.latitude, pos2.coords.longitude, pos2.coords.accuracy);
        });
      }
    } else {
      // 브라우저 미리보기
      await new Promise((res, rej) => navigator.geolocation.getCurrentPosition((p2) => { showMe(p2.coords.latitude, p2.coords.longitude, p2.coords.accuracy); res(); }, rej, { enableHighAccuracy: true, timeout: 15000 }));
    }
  } catch (err) { locErr(err); }
  $("#locate").classList.remove("busy");
}
async function stopLocate() {
  followMe = false;
  if (watchId != null) { try { await Geolocation.clearWatch({ id: watchId }); } catch { /* 무시 */ } watchId = null; }
}
$("#locate").addEventListener("click", () => {
  // 이미 위치를 보고 있으면 내 위치로 다시 맞추기만 한다.
  if (meMarker && watchId != null) { followMe = true; map.setView(meMarker.getLatLng(), Math.max(map.getZoom(), 16)); return; }
  startLocate();
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
  if (Array.isArray(T.checklist) && T.checklist.length) {
    const left = T.checklist.filter((x) => !checked.has(x)).length;
    parts.push(`<div class="info-card"><h2>준비물 <span class="muted small">${left ? `${left}개 남음` : "다 챙김"}</span></h2>
      <div class="checks">${T.checklist.map((x) => `<label><input type="checkbox" data-check="${esc(x)}" ${checked.has(x) ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
      <p class="muted small">첫 일정 3시간 전에 덜 챙긴 것을 알려 드립니다.</p></div>`);
  }
  // 비상 연락: 전화 앱으로 바로 건다.
  parts.push(`<div class="info-card"><h2>급할 때</h2><div class="sos">
    <a href="tel:112">🚓 경찰 112</a><a href="tel:119">🚑 화재·구급 119</a>
    <a href="tel:1330">ℹ️ 관광안내 1330</a><a href="https://www.lost112.go.kr" target="_blank" rel="noopener">🔎 분실물 조회</a>
  </div><p class="muted small">지하철 분실물은 역 고객안내센터, 택시는 카드 결제 내역의 차량 번호로 찾습니다.</p></div>`);
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
  if (v === "map") renderMap(); else stopLocate();
  if (v === "info") renderInfo();
  window.scrollTo(0, 0);
}
document.querySelector(".tabbar").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (b) showView(b.dataset.view);
});

/* ---------- 알림 ---------- */
let perm = { display: "prompt", exact: "unknown", channelBlocked: false };
// 알림 방식 조합마다 채널이 따로 있다(alarms.js channelFor). 만든 채널 id만 쓴다 — 없는 채널 id로 예약하면 안 뜬다.
const madeChannels = new Set();
const isAndroid = () => NATIVE && Capacitor.getPlatform() === "android";

async function ensureChannel() {
  const ch = channelFor(kinds);
  if (!isAndroid()) return null;
  try {
    if (!madeChannels.has(ch.id)) { await LocalNotifications.createChannel(ch); madeChannels.add(ch.id); }
    // 사용자가 시스템 설정에서 이 채널만 끄면 앱 권한은 켜져 있어도 안 뜬다. 중요도 0이면 꺼진 것(Codex 2차 검토 4).
    try {
      const { channels } = await LocalNotifications.listChannels();
      const mine = channels.find((c) => c.id === ch.id);
      perm.channelBlocked = !!mine && mine.importance === 0;
    } catch { perm.channelBlocked = false; }
    renderPerm();
    return ch.id;
  } catch (err) {
    console.error("채널 생성 실패", err);
    return null; // 플러그인 기본 채널로 예약
  }
}

async function ensurePermissions(ask) {
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted" && ask) p = await LocalNotifications.requestPermissions();
    perm.display = p.display;
  } catch { perm.display = "denied"; }
  if (isAndroid()) {
    try { perm.exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch { perm.exact = "unknown"; }
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
  } else if (perm.channelBlocked) {
    banner.hidden = false;
    banner.innerHTML = `<span>「${esc(channelFor(kinds).name)}」 알림 종류가 꺼져 있습니다. 설정 → 애플리케이션 → 서울 1박 2일 → 알림에서 켜 주세요.</span>`;
    box.className = "perm bad"; box.textContent = "알림 종류 꺼짐 — 울리지 않음";
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
const OVERDUE_KEEP_MS = 30 * 60000; // 시각이 지났는데 아직 대기 중인 알림(절전으로 늦어진 것)은 30분 안이면 남긴다
function computeList() {
  const list = buildAlarms(T, { now: now(), leads, disabled, departAlarm });
  const prep = prepAlarm(T, { now: now(), checked });
  return prep ? [...list, prep].sort((a, b) => a.at - b.at) : list;
}
async function doSchedule() {
  let list = computeList();
  lastScheduled = list;
  if (!NATIVE) { schedState = "미리보기"; renderSched(); return; }
  if (perm.display !== "granted") { schedState = "권한 없음 — 예약 안 됨"; renderSched(); return; }
  try {
    const channelId = await ensureChannel();
    const pending = (await LocalNotifications.getPending()).notifications;
    // 네이티브 호출 직전에 시각을 다시 거른다. 그 사이 지난 것은 플러그인이 등록하지 않는데 저장만 해서
    // 「예약 확인」으로 잘못 보인다(Codex 2차 검토 2).
    const cutoff = Date.now() + nowOffset + 3000;
    list = list.filter((a) => a.at.getTime() > cutoff);
    lastScheduled = list;
    const keep = new Set(list.map((a) => a.id));
    // 새 목록에 없는 것만 지운다. 같은 id는 schedule이 덮어쓴다. 시험 알림과, 시각이 막 지나 아직 대기 중인
    // (늦게 울릴) 알림은 남긴다 — 전부 지우면 앱을 연 순간 늦은 알림이 사라진다(Codex 2차 검토 1).
    const drop = pending.filter((p) => {
      if (p.id === TEST_ID || keep.has(p.id)) return false;
      const at = p.schedule && p.schedule.at ? new Date(p.schedule.at).getTime() : NaN;
      const overdue = Number.isFinite(at) && at <= Date.now() + nowOffset && Date.now() + nowOffset - at < OVERDUE_KEEP_MS;
      return !overdue;
    });
    if (drop.length) await LocalNotifications.cancel({ notifications: drop.map((p) => ({ id: p.id })) });
    if (list.length) {
      await LocalNotifications.schedule({
        notifications: list.map((a) => ({
          id: a.id, title: a.title, body: a.body, largeBody: a.largeBody, extra: a.extra,
          ...(channelId ? { channelId } : {}),
          schedule: { at: a.at, allowWhileIdle: true },
        })),
      });
    }
    const after = (await LocalNotifications.getPending()).notifications;
    const ids = new Set(after.map((p) => p.id));
    const missing = list.filter((a) => !ids.has(a.id)).length;
    schedState = missing ? `예약 불일치: ${missing}개 빠짐` : `예약 확인 ${list.length}개`;
    if (perm.channelBlocked) schedState = "채널이 꺼져 있어 울리지 않음";
  } catch (err) {
    console.error("알림 예약 실패", err);
    schedState = `예약 실패: ${err && err.message ? err.message : err}`;
  }
  renderSched();
}

function renderSched() {
  $("#sched-count").textContent = `${lastScheduled.length}개 · ${schedState}`;
  $("#sched-count").className = /실패|불일치|권한/.test(schedState) ? "bad-text" : "muted";
  // 날짜가 바뀌는 곳에 일자 머리줄을 넣어 1일차·2일차를 가른다.
  let lastDate = "";
  $("#sched-list").innerHTML = lastScheduled.length
    ? lastScheduled.map((a) => {
      const dIso = new Date(a.at.getTime() + 9 * 3600000).toISOString().slice(0, 10);
      const day = T.days.find((d) => d.date === dIso);
      const head = dIso !== lastDate
        ? `<li class="sched-day" style="--dc: var(--day${day ? ((day.day - 1) % 2) + 1 : 1})">${day ? `${day.day}일차 · ` : ""}${mdw(dIso)}</li>` : "";
      lastDate = dIso;
      return `${head}<li><b>${hhmm(a.at)}</b><span>${esc(a.title)}</span></li>`;
    }).join("")
    : `<li class="muted">남은 알림이 없습니다.</li>`;
}

/* 시점: 칩을 여러 개 고른다. 직접 입력한 값은 칩으로 더해지고 고른 상태가 된다. */
function renderLeads() {
  $("#lead-chips").innerHTML = leadOptions.map((m) =>
    `<label><input type="checkbox" value="${m}" ${leads.includes(m) ? "checked" : ""}>${m === 0 ? "정각" : `${m}분 전`}</label>`).join("");
  $("#lead-note").textContent = leads.length
    ? `일정마다 ${leads.length}번 울립니다(시작 시각 기준). 기차는 1시간 전 알림이 항상 더해집니다.`
    : "고른 시점이 없어 알림이 울리지 않습니다.";
  $("#lead-note").className = leads.length ? "muted small" : "bad-text small";
}
function saveLeads() {
  store.set("leads", leads);
  store.set("leadOptions", leadOptions.filter((m) => !PRESET_LEADS.includes(m)));
  renderLeads();
  schedule();
}
$("#lead-chips").addEventListener("change", (e) => {
  const m = +e.target.value;
  leads = normalizeLeads(e.target.checked ? [...leads, m] : leads.filter((x) => x !== m));
  saveLeads();
});
$("#lead-add").addEventListener("click", () => {
  const input = $("#lead-input");
  const v = Math.round(Number(input.value));
  if (!input.value || !Number.isFinite(v) || v < 0 || v > 600) { input.setCustomValidity("0~600 사이 숫자"); input.reportValidity(); return; }
  input.setCustomValidity("");
  if (!leads.includes(v) && leads.length >= MAX_LEADS) { alert(`시점은 ${MAX_LEADS}개까지 고를 수 있습니다.`); return; }
  leadOptions = normalizeLeads([...leadOptions, v]);
  leads = normalizeLeads([...leads, v]);
  input.value = "";
  saveLeads();
});

/* 방식: 소리·진동·팝업 각각 켜고 끈다. 바꾸면 그 조합의 채널로 다시 예약한다. */
function renderKinds() {
  for (const k of ["sound", "vibrate", "popup"]) $(`#kind-${k}`).checked = !!kinds[k];
  const none = !kinds.sound && !kinds.vibrate && !kinds.popup;
  $("#kind-note").textContent = none
    ? "모두 끄면 알림 목록에만 조용히 쌓입니다."
    : "팝업은 화면 위에 잠깐 뜨는 알림입니다. 폰이 무음·방해 금지면 소리는 나지 않습니다.";
}
$("#kind-chips").addEventListener("change", (e) => {
  const k = e.target.dataset.kind; if (!k) return;
  kinds[k] = e.target.checked;
  store.set("kinds", kinds);
  renderKinds();
  schedule();
});
$("#depart-alarm").addEventListener("change", (e) => {
  departAlarm = e.target.checked;
  store.set("departAlarm", departAlarm);
  schedule();
});

/* 일정별 알림 목록: 일자마다 모두 켜기/끄기, 항목마다 스위치. 지난 일정은 뺀다. */
function renderItemList() {
  const n = now();
  $("#item-list").innerHTML = T.days.map((d) => {
    const rows = d.items.map((it) => ({ it, key: itemKey(d, it), start: startOf(d, it) })).filter((r) => r.start > n);
    if (!rows.length) return "";
    const onCount = rows.filter((r) => !disabled.has(r.key)).length;
    return `<div class="item-day" style="--dc: var(--day${((d.day - 1) % 2) + 1})">
      <div class="item-day-band"><b>${d.day}일차</b><span>${mdw(d.date)} · ${esc(d.title)}</span></div>
      <div class="item-day-head"><span class="muted small">${onCount}/${rows.length}개 켬</span>
        <button type="button" class="text-btn" data-all="${d.day}" data-on="1">모두 켜기</button>
        <button type="button" class="text-btn" data-all="${d.day}" data-on="0">모두 끄기</button></div>
      ${rows.map((r) => `<div class="item-row${disabled.has(r.key) ? " off" : ""}"><span class="t">${r.it.time}</span>
        <span class="n">${esc(r.it.name)}${isCritical(r.it) ? ` <span class="chip must">놓치면 안 됨</span>` : ""}</span>
        ${switchHtml(r.key, !disabled.has(r.key))}</div>`).join("")}
    </div>`;
  }).join("") || `<p class="muted small">남은 일정이 없습니다.</p>`;
}
$("#item-list").addEventListener("change", (e) => {
  const k = e.target.dataset.key; if (k == null) return;
  setItemAlarm([k], e.target.checked);
});
$("#item-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-all]"); if (!b) return;
  const d = T.days.find((x) => x.day === +b.dataset.all);
  const n = now();
  const keys = d.items.filter((it) => startOf(d, it) > n).map((it) => itemKey(d, it));
  setItemAlarm(keys, b.dataset.on === "1");
});

$("#test-alarm").addEventListener("click", async () => {
  if (!NATIVE) { alert("시험 알림은 설치한 앱에서만 됩니다."); return; }
  await ensurePermissions(true);
  if (perm.display !== "granted") { alert("알림 권한을 먼저 켜 주세요."); return; }
  const channelId = await ensureChannel();
  const first = T.days[0].items[0];
  const ld = leads[leads.length - 1] ?? 10;
  await LocalNotifications.schedule({
    notifications: [{
      id: TEST_ID, title: `시험 · ${alarmTitle(first)}`, body: `${ld === 0 ? "지금" : `${ld}분 전`} — 이렇게 일정 알림이 옵니다. 앱을 닫아 둬도 울립니다.`,
      ...(channelId ? { channelId } : {}), schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true },
    }],
  });
  $("#test-alarm").textContent = "10초 뒤에 울립니다 — 앱을 닫아 보세요";
  setTimeout(() => { $("#test-alarm").textContent = "10초 뒤 시험 알림"; }, 12000);
});

$("#open-settings").addEventListener("click", () => {
  renderLeads(); renderKinds(); renderItemList(); renderSched();
  $("#depart-alarm").checked = departAlarm;
  $("#settings").showModal();
});

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
    else if (x && x.view) showView(x.view); // 준비물 알림 → 정보 탭
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
