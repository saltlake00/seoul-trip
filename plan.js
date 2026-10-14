(function () {
  const B = window.BOARD;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TYPE_COLOR = { 관광: "#2563eb", 식당: "#ea580c", 카페: "#92400e", 숙소: "#7c3aed" };
  const STATUS_ORDER = { 확정: 0, "투표 중": 1, 후보: 2, 제외: 3 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dday = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Math.round((new Date(y, m - 1, d) - today) / 86400000);
  };
  const ddayText = (n) => (n > 0 ? `D-${n}` : n === 0 ? "D-DAY" : `D+${-n}`);
  const dayLabel = (d) => (d === 1 ? "1일차 (11/14 토)" : d === 2 ? "2일차 (11/15 일)" : "날짜 미정");
  const won = (n) => (n ? `1인 ${n.toLocaleString("ko-KR")}원` : "");
  const pill = (text, cls) => `<span class="pill ${cls || ""}">${esc(text)}</span>`;
  const typeTag = (t) => `<span class="type" style="background:${TYPE_COLOR[t] || "#555"}">${esc(t)}</span>`;

  // ── 상단 ──
  $("eyebrow").innerHTML = B.sample ? '<span class="badge warn">후보 목록은 샘플</span>' : "";
  $("meta").textContent = `여행까지 ${ddayText(dday(B.tripStart))} · 마지막 갱신 ${B.updated}`;

  const live = B.candidates.filter((c) => c.status !== "제외");
  const needsBooking = (c) => (c.reserve === "필수" || c.reserve === "권장" || c.reserve === "확인 필요")
    && c.reserveStatus !== "예약 완료" && c.reserveStatus !== "취소";
  const todo = live.filter(needsBooking);
  const openPending = B.pending.filter((p) => !p.done);

  const stats = [
    { n: live.filter((c) => c.status === "확정").length, label: "확정" },
    { n: live.filter((c) => c.status === "투표 중").length, label: "투표 중" },
    { n: openPending.length, label: "결정 대기", warn: openPending.length > 0 },
    { n: todo.length, label: "예약할 곳", warn: todo.length > 0 }
  ];
  $("stats").innerHTML = stats.map((s) =>
    `<div class="stat ${s.warn ? "warn" : ""}"><b>${s.n}</b><span>${s.label}</span></div>`).join("");

  // ── 결정 대기 ──
  $("pending").innerHTML = `<h2>⏳ 결정 대기</h2><ul class="checks">${B.pending.map((p) =>
    `<li class="${p.done ? "done" : ""}"><span class="box">${p.done ? "✓" : ""}</span>${esc(p.text)}</li>`).join("")}</ul>`;

  // ── 예약 현황 칸반 ──
  const bookable = live.filter((c) => c.reserve);
  const cols = [
    { key: "todo", title: "예약해야 함", tone: "red", pick: (c) => needsBooking(c) && c.reserveStatus !== "대기 중" },
    { key: "wait", title: "대기 중", tone: "yellow", pick: (c) => c.reserveStatus === "대기 중" },
    { key: "done", title: "예약 완료", tone: "green", pick: (c) => c.reserveStatus === "예약 완료" },
    { key: "walk", title: "예약 없이 감", tone: "gray", pick: (c) => c.reserve === "웨이팅" || c.reserve === "불필요" }
  ];
  const bookCard = (c) => {
    const open = c.open ? dday(c.open) : null;
    return `<div class="kcard">
      <div class="kname">${typeTag(c.type)}${esc(c.name)}</div>
      <div class="ksub">${dayLabel(c.day)} · ${esc(c.slot || "")}${c.status !== "확정" ? ` · ${esc(c.status)}` : ""}</div>
      <div class="kpills">
        ${c.reserve ? pill(`예약 ${c.reserve}`, c.reserve === "필수" ? "red" : c.reserve === "웨이팅" ? "yellow" : "") : ""}
        ${c.seats8 ? pill(`8인 ${c.seats8}`, c.seats8 === "가능" ? "green" : c.seats8 === "불가" ? "red" : c.seats8 === "나눠 앉기" ? "yellow" : "") : ""}
        ${c.method ? pill(c.method) : ""}
        ${open !== null ? pill(open > 0 ? `예약 오픈 ${ddayText(open)}` : "예약 열림", open > 0 && open <= 7 ? "red" : "blue") : ""}
      </div>
      ${c.note ? `<div class="ksub">${esc(c.note)}</div>` : ""}
    </div>`;
  };
  $("kanban").innerHTML = cols.map((col) => {
    const items = bookable.filter(col.pick);
    return `<div class="kcol tone-${col.tone}">
      <div class="khead">${col.title}<span>${items.length}</span></div>
      ${items.length ? items.map(bookCard).join("") : '<div class="kempty">없음</div>'}
    </div>`;
  }).join("");

  // ── 후보 목록 ──
  const types = ["전체", ...Object.keys(TYPE_COLOR).filter((t) => B.candidates.some((c) => c.type === t))];
  let filter = "전체";
  $("chips").innerHTML = types.map((t) => `<button class="chip" data-t="${t}">${t}</button>`).join("");
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) { filter = b.dataset.t; renderCands(); }
  });

  // 장소 소개 카드 — 대한민국 구석구석처럼 소개 + 기본 정보 + 지도 링크
  function detail(c) {
    const q = encodeURIComponent(c.map || c.name);
    const rows = Object.entries(c.info || {})
      .map(([k, v]) => `<div class="irow"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    return `<div class="cdetail">
      ${c.desc ? `<p class="cdesc">${esc(c.desc)}</p>` : ""}
      ${rows ? `<dl class="info">${rows}</dl>` : ""}
      <div class="btns">
        <a class="btn" href="${c.link ? esc(c.link) : `https://map.naver.com/p/search/${q}`}" target="_blank" rel="noopener">네이버지도</a>
        <a class="btn primary" href="https://map.kakao.com/?q=${q}" target="_blank" rel="noopener">카카오맵</a>
      </div>
    </div>`;
  }

  function renderCands() {
    document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === filter)));
    const list = B.candidates.filter((c) => filter === "전체" || c.type === filter);
    const groups = [1, 2, null].map((d) => ({ d, items: list.filter((c) => (c.day ?? null) === d) }))
      .filter((g) => g.items.length);
    const maxVotes = Math.max(1, ...B.candidates.map((c) => c.votes || 0));
    $("cands").innerHTML = groups.map((g) => `
      <div class="cgroup">
        <h3>${dayLabel(g.d)}</h3>
        ${g.items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.votes || 0) - (a.votes || 0))
          .map((c) => {
            const st = c.status === "확정" ? "ok" : c.status === "제외" ? "out" : "mid";
            const row = `
            <div class="cmain">
              <div class="cname">${c.emoji ? `<span class="cemoji">${c.emoji}</span>` : ""}${typeTag(c.type)}${esc(c.name)}</div>
              <div class="ksub">${[c.slot, won(c.budget), c.note].filter(Boolean).map(esc).join(" · ")}</div>
            </div>
            <div class="cside">
              ${pill(c.status, c.status === "확정" ? "green" : c.status === "투표 중" ? "yellow" : c.status === "제외" ? "" : "blue")}
              <div class="votes" title="추천 ${c.votes || 0}명"><i style="width:${((c.votes || 0) / maxVotes) * 100}%"></i></div>
              <span class="vnum">추천 ${c.votes || 0}</span>
            </div>`;
            if (!c.desc && !c.info) return `<div class="crow st-${st}">${row}</div>`;
            return `<details class="cand st-${st}"><summary class="crow">${row}</summary>${detail(c)}</details>`;
          }).join("")}
      </div>`).join("") || '<p class="muted">해당 분류의 후보가 없습니다.</p>';
  }
  renderCands();

  // ── 회의 기록 ──
  $("meetings").innerHTML = `<h2>🗒️ 회의 기록</h2>${[...B.meetings].reverse().map((m) => `
    <div class="meeting"><div class="mhead"><b>${m.no}회차</b> ${esc(m.title)} <span class="muted">${esc(m.date)}</span></div>
    <ul>${m.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}`;

  $("foot").textContent = `마지막 갱신 ${B.updated} · 노션 정리 페이지 기준`;
})();
