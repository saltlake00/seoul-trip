(function () {
  const T = window.TRIP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TYPE_COLOR = {
    집결: "#c2410c", 관광: "#2563eb", 식당: "#ea580c", 카페: "#92400e", 숙소: "#7c3aed", 해산: "#64748b"
  };
  const MOVE_ICON = { 도보: "🚶", 지하철: "🚇", 버스: "🚌", 택시: "🚕", 차량: "🚗" };
  const span = (it) => it.end ? `${it.time}~${it.end}` : it.time; // end = 예상 종료 시각
  const css = getComputedStyle(document.documentElement);
  const DAY_COLOR = [css.getPropertyValue("--day1").trim(), css.getPropertyValue("--day2").trim(), "#059669", "#d97706"];

  const kakaoMap = (n, lat, lng) => `https://map.kakao.com/link/map/${encodeURIComponent(n)},${lat},${lng}`;
  const kakaoTo = (n, lat, lng) => `https://map.kakao.com/link/to/${encodeURIComponent(n)},${lat},${lng}`;
  const linkBtns = (n, lat, lng) => `<div class="btns">
      <a class="btn primary" href="${kakaoTo(n, lat, lng)}" target="_blank" rel="noopener">카카오맵 길찾기</a>
      <a class="btn" href="${kakaoMap(n, lat, lng)}" target="_blank" rel="noopener">위치 보기</a>
    </div>`;

  // ── 상단 ──
  document.title = T.title;
  $("eyebrow").innerHTML = T.sample ? '<span class="badge warn">샘플 데이터</span>'
    : T.draft ? `<span class="badge warn">${esc(T.draft)}</span>` : "";
  $("title").textContent = T.title;
  const dateText = T.dates.end ? `${T.dates.start} ~ ${T.dates.end}` : T.dates.start;
  $("meta").textContent = `${dateText} · ${T.people}명 · 마지막 갱신 ${T.updated}`;

  const m = T.meetup;
  $("meetup").innerHTML = `
    <div class="muted">집결</div>
    <div class="big">${esc(m.time)} · ${esc(m.place)}</div>
    <div class="muted">${esc(m.note)}</div>
    ${linkBtns(m.place, m.lat, m.lng)}`;

  // ── 지도 ──
  // ?og — 카카오톡·SNS 미리보기 이미지(og-map.jpg)를 찍는 모드. 지도만 화면 가득 그린다. docs/갱신-가이드.md 「미리보기 이미지」
  const OG = new URLSearchParams(location.search).has("og");
  if (OG) document.body.classList.add("og");
  const map = L.map("map", { scrollWheelZoom: false, tap: true, zoomControl: !OG });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const layers = T.days.map(() => L.layerGroup());
  const markerOf = {}; // "day-idx" → marker

  T.days.forEach((d, di) => {
    const color = DAY_COLOR[di % DAY_COLOR.length];
    const pts = d.items.map((it) => [it.lat, it.lng]);
    L.polyline(pts, { color, weight: 4, opacity: .8, dashArray: "1 8", lineCap: "round" }).addTo(layers[di]);
    L.polyline(pts, { color, weight: 3, opacity: .35 }).addTo(layers[di]);

    // 핀 번호 = 그 날 일정 순서(카드 번호와 같다). 숙소 일정은 번호 대신 아래 🛏 핀 하나로 그린다.
    // 150m 안에 붙은 장소는 핀 하나로 합친다 — 용산역·아이파크몰처럼 겹쳐서 앞 번호가 가려지지 않게.
    const groups = [];
    d.items.forEach((it, i) => {
      if (it.type === "숙소") return;
      const g = groups.find((g) => L.latLng(g[0].it.lat, g[0].it.lng).distanceTo([it.lat, it.lng]) < 150);
      if (g) g.push({ it, i }); else groups.push([{ it, i }]);
    });
    groups.forEach((g) => {
      const first = g[0].it;
      const label = g.map(({ i }) => i + 1).join("·");
      const cand = g.every(({ it }) => it.status === "후보") ? "cand" : "";
      const icon = g.length === 1
        ? L.divIcon({ className: "", html: `<div class="pin ${cand}" style="background:${color}"><b>${label}</b></div>`,
            iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] })
        : L.divIcon({ className: "", html: `<div class="pin multi ${cand}" style="background:${color}">${label}</div>`,
            // 지점 옆에 붙인다(1일차 왼쪽, 2일차 아래) — 같은 곳의 다른 날 핀과 겹치지 않게
            iconSize: [16 + label.length * 8, 24],
            iconAnchor: di % 2 ? [8 + label.length * 4, -4] : [16 + label.length * 8 + 2, 12],
            popupAnchor: di % 2 ? [0, 4] : [-(8 + label.length * 4), -12] });
      const mk = L.marker([first.lat, first.lng], { icon, title: g.map(({ it }) => it.name).join(" · "), zIndexOffset: g.length > 1 ? 300 : 0 })
        .bindPopup(g.map(({ it, i }) => `<b>${i + 1}. ${d.day}일차 ${esc(span(it))}</b><br>${esc(it.name)}
          ${it.status === "후보" ? ' <span class="badge">후보</span>' : ""}
          ${it.note ? `<br><span style="color:#666">${esc(it.note)}</span>` : ""}`).join("<hr>")
          + linkBtns(first.name, first.lat, first.lng))
        .addTo(layers[di]);
      g.forEach(({ i }) => { markerOf[`${di}-${i}`] = mk; });
    });
  });

  // 숙소: 🛏 핀은 늘 찍는다. 개인 주소면 핀은 동네 중심값이고 반경 300m 원을 같이 그린다.
  const s = T.stay;
  const stayLayer = L.marker([s.lat, s.lng], {
    title: "숙소", zIndexOffset: 500,
    icon: L.divIcon({ className: "", html: `<div class="pin" style="background:${TYPE_COLOR.숙소}"><b>🛏</b></div>`,
      iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] })
  }).bindPopup(`<b>숙소${s.exact ? "" : " (대략적 위치)"}</b><br>${esc(s.name)}
    ${s.exact ? "" : '<br><span style="color:#666">정확한 주소는 단톡방 공지 참고</span>'}`).addTo(map);
  if (!s.exact) L.circle([s.lat, s.lng], { radius: 300, color: TYPE_COLOR.숙소, weight: 2, dashArray: "4 6", fillOpacity: .12 }).addTo(map);

  // ── 일자 탭 ──
  let current = "all";
  let lastBounds = null;

  // 백그라운드 탭에서 열리면 지도 크기가 0으로 잡혀 최대 확대된다 — 크기가 생기면 다시 맞춘다
  let wasHidden = $("map").clientWidth === 0;
  new ResizeObserver(() => {
    if ($("map").clientWidth === 0) { wasHidden = true; return; }
    map.invalidateSize();
    if (wasHidden && lastBounds) map.fitBounds(lastBounds, { padding: [30, 30] });
    wasHidden = false;
  }).observe($("map"));
  const tabs = [{ key: "all", label: "전체" }, ...T.days.map((d, i) => ({ key: i, label: `${d.day}일차` }))];
  $("tabs").innerHTML = tabs.map((t) => `<button class="tab" data-key="${t.key}">${t.label}</button>`).join("");
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) show(b.dataset.key === "all" ? "all" : Number(b.dataset.key));
  });

  function show(key) {
    current = key;
    document.querySelectorAll(".tab").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.key === String(key))));
    const bounds = L.latLngBounds([]);
    layers.forEach((lg, i) => {
      const on = key === "all" || key === i;
      if (on) { lg.addTo(map); T.days[i].items.forEach((it) => bounds.extend([it.lat, it.lng])); bounds.extend([s.lat, s.lng]); }
      else map.removeLayer(lg);
    });
    lastBounds = bounds;
    if (OG) {
      // 미리보기 이미지: 헤드리스 창은 처음 크기가 달라 fitBounds가 한 단계 멀게 잡는다 — 12단계로 고정하고 범례 상자만큼 민다
      map.setView(bounds.getCenter(), 12, { animate: false });
      map.panBy([-80, -12], { animate: false });
    } else map.fitBounds(bounds, { padding: [30, 30] });
    document.querySelectorAll(".day").forEach((el) => {
      el.hidden = !(key === "all" || Number(el.dataset.day) === key);
    });
  }

  $("legend").innerHTML = T.days.map((d, i) =>
    `<span><i style="background:${DAY_COLOR[i % DAY_COLOR.length]}"></i>${d.day}일차 ${esc(d.title)}</span>`).join("")
    + `<span>🛏 숙소${s.exact ? "" : " (대략 위치)"}</span>`
    + `<span class="muted">흐린 핀·점선 카드 = 후보</span>`;

  // ── 타임라인 ──
  $("timeline").innerHTML = T.days.map((d, di) => `
    <div class="day" data-day="${di}">
      <div class="day-head">
        <span class="dot" style="background:${DAY_COLOR[di % DAY_COLOR.length]}"></span>
        <h2>${d.day}일차</h2><span class="muted">${esc(d.title)}</span>
      </div>
      ${d.items.map((it, i) => `
        ${it.move ? `<div class="move">${MOVE_ICON[it.move.mode] || "➡️"} ${esc(it.move.mode)}
          ${it.move.detail ? ` · ${esc(it.move.detail)}` : ""}${it.move.min ? ` · 약 ${it.move.min}분` : ""}</div>` : ""}
        <button class="stop ${it.status === "후보" ? "cand" : ""}" data-key="${di}-${i}">
          <div class="num ${it.status === "후보" ? "cand" : ""}"
            style="background:${it.type === "숙소" ? TYPE_COLOR.숙소 : DAY_COLOR[di % DAY_COLOR.length]}">${it.type === "숙소" ? "🛏" : i + 1}</div>
          <div class="time">${esc(it.time)}${it.end ? `<div class="end">~${esc(it.end)}</div>` : ""}</div>
          <div>
            <div class="name"><span class="type" style="background:${TYPE_COLOR[it.type] || "#555"}">${esc(it.type)}</span>${esc(it.name)}
              ${it.status === "후보" ? '<span class="badge">후보</span>' : ""}</div>
            ${[it.note, it.cost, it.reserve].filter(Boolean).length
              ? `<div class="sub">${[it.note, it.cost, it.reserve].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
          </div>
        </button>`).join("")}
    </div>`).join("");

  $("timeline").addEventListener("click", (e) => {
    const b = e.target.closest(".stop");
    if (!b) return;
    const [di, i] = b.dataset.key.split("-").map(Number);
    if (current !== "all" && current !== di) show(di);
    const it = T.days[di].items[i];
    const mk = markerOf[b.dataset.key];
    $("map").scrollIntoView({ behavior: "smooth", block: "center" });
    map.setView([it.lat, it.lng], 16);
    if (mk) mk.openPopup(); else stayLayer.openPopup();
  });

  // ── 숙소·교통 ──
  $("stay").innerHTML = `<h2>🛏️ 숙소</h2>
    <div><b>${esc(s.name)}</b></div>
    <div class="muted">체크인 ${esc(s.checkin)} · 체크아웃 ${esc(s.checkout)}</div>
    ${s.exact ? "" : '<div class="muted">정확한 주소는 단톡방 공지 참고</div>'}
    ${s.link ? `<div class="btns"><a class="btn" href="${esc(s.link)}" target="_blank" rel="noopener">예약 페이지</a></div>` : ""}`;
  $("transport").innerHTML = `<h2>🚇 교통</h2><ul>${T.transport.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;

  // ── 식당·카페 ──
  const foods = T.days.flatMap((d) => d.items.filter((it) => it.type === "식당" || it.type === "카페")
    .map((it) => ({ ...it, day: d.day })));
  $("food").innerHTML = `<h2>🍽️ 식당·카페</h2><ul class="food-list">${foods.map((f) => `
    <li><div><b>${esc(f.name)}</b> ${f.status === "후보" ? '<span class="badge">후보</span>' : ""}
      <div class="muted" style="font-size:13px">${f.day}일차 ${esc(span(f))}${f.note ? " · " + esc(f.note) : ""}</div></div>
      <div class="r">${esc(f.cost || "")}${f.reserve ? `<br>${esc(f.reserve)}` : ""}</div></li>`).join("")}</ul>`;

  // ── 결정 대기·준비물 ──
  $("pending").innerHTML = `<h2>⏳ 결정 대기</h2><ul>${T.pending.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  $("checklist").innerHTML = `<h2>🎒 준비물</h2><ul>${T.checklist.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  $("foot").textContent = `마지막 갱신 ${T.updated} · 지도 데이터 © OpenStreetMap 기여자`;

  show("all");

  if (OG) {
    const box = document.createElement("div");
    box.className = "og-legend";
    box.innerHTML = `<b>${esc(T.title)}</b><span>${esc(dateText)}</span>`
      + T.days.map((d, i) => `<span><i style="background:${DAY_COLOR[i % DAY_COLOR.length]}"></i>${d.day}일차 ${esc(d.title)}</span>`).join("")
      + `<span>🛏 숙소</span>`;
    $("map").appendChild(box);
  }
})();
