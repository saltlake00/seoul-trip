(function () {
  const T = window.TRIP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TYPE_COLOR = {
    집결: "#c2410c", 관광: "#2563eb", 식당: "#ea580c", 카페: "#92400e", 숙소: "#7c3aed", 해산: "#64748b"
  };
  const MOVE_ICON = { 도보: "🚶", 지하철: "🚇", 버스: "🚌", 택시: "🚕", 차량: "🚗" };
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
  const map = L.map("map", { scrollWheelZoom: false, tap: true });
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

    d.items.forEach((it, i) => {
      if (it.type === "숙소" && !T.stay.exact) return; // 숙소는 아래에서 범위로 따로 그린다
      const icon = L.divIcon({
        className: "",
        html: `<div class="pin ${it.status === "후보" ? "cand" : ""}" style="background:${color}"><b>${i + 1}</b></div>`,
        iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26]
      });
      const mk = L.marker([it.lat, it.lng], { icon, title: it.name })
        .bindPopup(`<b>${d.day}일차 ${esc(it.time)}</b><br>${esc(it.name)}
          ${it.status === "후보" ? ' <span class="badge">후보</span>' : ""}
          ${it.note ? `<br><span style="color:#666">${esc(it.note)}</span>` : ""}
          ${linkBtns(it.name, it.lat, it.lng)}`)
        .addTo(layers[di]);
      markerOf[`${di}-${i}`] = mk;
    });
  });

  // 숙소: 개인 주소면 정확한 위치 대신 반경 300m만 표시
  const s = T.stay;
  const stayLayer = s.exact
    ? L.marker([s.lat, s.lng]).bindPopup(`<b>숙소</b><br>${esc(s.name)}`)
    : L.circle([s.lat, s.lng], { radius: 300, color: TYPE_COLOR.숙소, weight: 2, dashArray: "4 6", fillOpacity: .12 })
        .bindPopup(`<b>숙소 (대략적 위치)</b><br>${esc(s.name)}`);
  stayLayer.addTo(map);

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
      if (on) { lg.addTo(map); T.days[i].items.forEach((it) => bounds.extend([it.lat, it.lng])); }
      else map.removeLayer(lg);
    });
    lastBounds = bounds;
    map.fitBounds(bounds, { padding: [30, 30] });
    document.querySelectorAll(".day").forEach((el) => {
      el.hidden = !(key === "all" || Number(el.dataset.day) === key);
    });
  }

  $("legend").innerHTML = T.days.map((d, i) =>
    `<span><i style="background:${DAY_COLOR[i % DAY_COLOR.length]}"></i>${d.day}일차 ${esc(d.title)}</span>`).join("")
    + `<span><i style="background:${TYPE_COLOR.숙소};opacity:.5"></i>숙소 부근</span>`
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
          <div class="time">${esc(it.time)}</div>
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
      <div class="muted" style="font-size:13px">${f.day}일차 ${esc(f.time)}${f.note ? " · " + esc(f.note) : ""}</div></div>
      <div class="r">${esc(f.cost || "")}${f.reserve ? `<br>${esc(f.reserve)}` : ""}</div></li>`).join("")}</ul>`;

  // ── 결정 대기·준비물 ──
  $("pending").innerHTML = `<h2>⏳ 결정 대기</h2><ul>${T.pending.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  $("checklist").innerHTML = `<h2>🎒 준비물</h2><ul>${T.checklist.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  $("foot").textContent = `마지막 갱신 ${T.updated} · 지도 데이터 © OpenStreetMap 기여자`;

  show("all");
})();
