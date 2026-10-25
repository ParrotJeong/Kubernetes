/* CKA Daily — 사이트 스크립트. 빌드 없이 GitHub Pages 에서 그대로 동작한다. */
(() => {
  "use strict";

  const LEVEL = { 1: "★☆☆ 기본", 2: "★★☆ 보통", 3: "★★★ 도전" };
  const page = document.body.dataset.page;

  // ---------- 저장소 (브라우저별 진도 저장) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("cka:" + key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("cka:" + key, JSON.stringify(value));
      } catch {
        /* 사생활 보호 모드 등 저장이 막힌 환경 */
      }
    },
  };
  const pid = (day, qid) => `D${day}-${qid}`;
  const doneMap = () => store.get("done", {});
  const flagMap = () => store.get("flag", {});
  function setIn(key, id, value) {
    const map = store.get(key, {});
    if (value) map[id] = value;
    else delete map[id];
    store.set(key, map);
  }

  // ---------- 테마 ----------
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  applyTheme(store.get("theme", null));
  function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const isDark = () =>
      (document.documentElement.dataset.theme ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    const render = () => {
      btn.textContent = isDark() ? "☀" : "☾";
      btn.title = isDark() ? "라이트 모드로 전환" : "다크 모드로 전환";
      btn.setAttribute("aria-label", btn.title);
    };
    btn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      applyTheme(next);
      store.set("theme", next);
      render();
    });
    render();
  }

  // ---------- 유틸 ----------
  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url} 를 불러오지 못했습니다 (HTTP ${res.status})`);
    return res.json();
  }
  async function getText(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url} 를 불러오지 못했습니다 (HTTP ${res.status})`);
    return res.text();
  }
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $ = (sel, root = document) => root.querySelector(sel);
  function showError(target, err) {
    target.innerHTML = `<div class="error-box">⚠ ${esc(err.message || err)}</div>`;
    console.error(err);
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function domainMap(curriculum) {
    return Object.fromEntries(curriculum.domains.map((d) => [d.id, d]));
  }
  function domainBadge(id, domains) {
    const d = domains[id];
    return `<span class="badge domain d-${esc(id)}">${esc(d ? d.ko : id)}</span>`;
  }
  function stripFrontMatter(text) {
    return text.replace(/^---\n[\s\S]*?\n---\n/, "");
  }
  function externalLinks(root) {
    root.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener";
    });
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }
  function enhanceCode(root) {
    root.querySelectorAll("pre > code").forEach((code) => {
      if (window.hljs && /language-/.test(code.className)) {
        try {
          window.hljs.highlightElement(code);
        } catch {
          /* 미지원 언어는 그대로 둔다 */
        }
      }
      const pre = code.parentElement;
      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "복사";
      btn.addEventListener("click", async () => {
        const ok = await copyText(code.textContent.replace(/\n$/, ""));
        btn.textContent = ok ? "복사됨" : "실패";
        btn.classList.toggle("copied", ok);
        setTimeout(() => {
          btn.textContent = "복사";
          btn.classList.remove("copied");
        }, 1400);
      });
      wrap.appendChild(btn);
    });
  }
  let markedReady = false;
  function renderMarkdown(md) {
    if (!markedReady) {
      // GFM 은 ~한 개~ 도 취소선으로 처리해서 "15~20분, 6~8분" 같은 범위 표기가 깨진다. ~~두 개~~ 만 취소선으로 인정한다.
      window.marked.use({
        tokenizer: {
          del(src) {
            const m = /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?=[^~]|$)/.exec(src);
            if (m) return { type: "del", raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
          },
        },
      });
      markedReady = true;
    }
    return window.marked.parse(md, { gfm: true });
  }
  function dayProgress(entry, done) {
    const total = entry.problems.length;
    const solved = entry.problems.filter((p) => done[pid(entry.day, p.id)]).length;
    return { total, solved };
  }

  // ---------- 대시보드 ----------
  async function initIndex() {
    const root = $("#dashboard");
    let manifest, curriculum, plan;
    try {
      [manifest, curriculum, plan] = await Promise.all([
        getJSON("days/manifest.json"),
        getJSON("data/curriculum.json"),
        getJSON("data/plan.json"),
      ]);
    } catch (e) {
      showError(root, e);
      return;
    }
    const domains = domainMap(curriculum);
    const days = manifest.days.slice().sort((a, b) => a.day - b.day);
    const done = doneMap();
    const flags = flagMap();
    const read = store.get("read", {});

    // 오늘의 문제
    const latest = days[days.length - 1];
    const todayBox = $("#today");
    if (!latest) {
      todayBox.innerHTML = `<div class="empty">아직 만들어진 문제가 없습니다.<br>Claude 에게 <b>“오늘 CKA 문제 만들어줘”</b> 라고 요청하세요.</div>`;
    } else {
      const isToday = latest.date === todayISO();
      const { total, solved } = dayProgress(latest, done);
      const mins = latest.problems.reduce((s, p) => s + p.minutes, 0);
      todayBox.innerHTML = `
        <div class="eyebrow">${isToday ? "오늘의 학습" : "최신 학습"} · Day ${latest.day} · ${esc(latest.date)}</div>
        <h2>${esc(latest.title)}</h2>
        <p class="summary">${esc(latest.summary)}</p>
        <ul class="problem-list">
          ${latest.problems
            .map(
              (p) => `<li><span class="check">${done[pid(latest.day, p.id)] ? "✔" : "○"}</span>
              <span><b>${esc(p.id)}</b> ${esc(p.title)}</span> ${domainBadge(p.domain, domains)}</li>`,
            )
            .join("")}
        </ul>
        <div class="actions">
          ${
            latest.study
              ? `<a class="btn" href="day.html?d=${latest.day}&view=notes">📖 학습 노트${latest.study_minutes ? ` · 약 ${latest.study_minutes}분` : ""}</a>`
              : ""
          }
          <a class="btn${latest.study ? " secondary" : ""}" href="day.html?d=${latest.day}&view=problems">✍️ ${solved ? "이어서 풀기" : "문제 풀기"}</a>
          <span class="muted small" style="align-self:center">${read[`D${latest.day}`] ? "노트 읽음 ✓ · " : ""}${solved}/${total} 완료 · 권장 ${mins}분</span>
        </div>`;
    }

    // D-day
    const dday = $("#dday");
    const input = $("#exam-date");
    const renderDday = () => {
      const v = store.get("examDate", "");
      input.value = v;
      if (!v) {
        dday.innerHTML = `<div class="big">D-?</div><div class="muted small">시험일을 정하면 남은 날짜를 보여줍니다.</div>`;
        return;
      }
      const diff = Math.round((new Date(v + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);
      const label = diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : `D+${-diff}`;
      const remain = plan.days.length - days.length;
      const tip =
        diff > 0 && remain > 0
          ? `로드맵 남은 Day ${remain}개 → ${diff >= remain ? "하루 1세트면 충분합니다." : `하루 ${Math.ceil(remain / diff)}세트가 필요합니다.`}`
          : diff === 0
            ? "오늘은 시험일! 화이팅."
            : "";
      dday.innerHTML = `<div class="big">${label}</div><div class="muted small">${esc(v)} 시험 · ${tip}</div>`;
    };
    input.addEventListener("change", () => {
      store.set("examDate", input.value);
      renderDday();
    });
    renderDday();

    // 진행 현황
    const allProblems = days.flatMap((d) => d.problems.map((p) => ({ ...p, day: d.day })));
    const solvedAll = allProblems.filter((p) => done[pid(p.day, p.id)]).length;
    const doneDays = days.filter((d) => {
      const { total, solved } = dayProgress(d, done);
      return total && solved === total;
    }).length;
    $("#progress").innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="num">${solvedAll}<span class="muted" style="font-size:16px">/${allProblems.length}</span></div><div class="label">푼 문제</div></div>
        <div class="stat"><div class="num">${doneDays}<span class="muted" style="font-size:16px">/${days.length}</span></div><div class="label">완료한 Day</div></div>
        <div class="stat"><div class="num">${days.length}<span class="muted" style="font-size:16px">/${plan.days.length}</span></div><div class="label">로드맵 진행</div></div>
      </div>
      <div class="domain-bars">
        ${curriculum.domains
          .map((d) => {
            const ps = allProblems.filter((p) => p.domain === d.id);
            const s = ps.filter((p) => done[pid(p.day, p.id)]).length;
            const pct = ps.length ? Math.round((s / ps.length) * 100) : 0;
            return `<div class="domain-bar d-${d.id}">
              <div class="top"><span class="name">${esc(d.ko)}</span>
              <span class="muted">${s}/${ps.length}문제 · 시험 비중 ${d.weight}%</span></div>
              <div class="bar"><span style="width:${pct}%"></span></div></div>`;
          })
          .join("")}
      </div>`;

    // 다시 볼 문제
    const flagged = allProblems.filter((p) => flags[pid(p.day, p.id)]);
    $("#flagged").innerHTML = flagged.length
      ? `<ul class="problem-list">${flagged
          .map(
            (p) => `<li><span class="check" style="color:var(--star)">★</span>
            <a href="day.html?d=${p.day}#${p.id.toLowerCase()}">Day ${p.day} ${esc(p.id)} · ${esc(p.title)}</a></li>`,
          )
          .join("")}</ul>`
      : `<p class="muted small" style="margin:0">문제 카드의 <b>☆ 다시 보기</b>를 누르면 여기에 모입니다.</p>`;

    // 전체 Day
    $("#day-list").innerHTML = days.length
      ? days
          .slice()
          .reverse()
          .map((d) => {
            const { total, solved } = dayProgress(d, done);
            return `<a class="day-item ${solved === total ? "complete" : ""}" href="day.html?d=${d.day}">
              <div class="day-num"><div><small>DAY</small>${d.day}</div></div>
              <div><div class="title">${esc(d.title)}</div>
                <div class="meta">${esc(d.date)} · ${esc(d.focus)}</div></div>
              <div class="progress">${read[`D${d.day}`] ? "📖✓ · " : ""}${solved === total ? "✔ 완료" : `${solved}/${total}`}</div></a>`;
          })
          .join("")
      : `<div class="empty">아직 없습니다.</div>`;

    // 다음 예정
    const upcoming = plan.days.filter((d) => d.day > (latest ? latest.day : 0)).slice(0, 4);
    $("#upcoming").innerHTML = upcoming.length
      ? `<ul class="upcoming">${upcoming
          .map((d) => `<li><span class="d">Day ${d.day}</span><span>${esc(d.title)}</span></li>`)
          .join("")}</ul><p class="small" style="margin:12px 0 0"><a href="roadmap.html">전체 로드맵 보기 →</a></p>`
      : `<p class="muted small">로드맵을 모두 마쳤습니다. 이제 약점 복습 세트와 추가 모의고사를 요청하세요.</p>`;
  }

  // ---------- Day 페이지 (학습 노트 / 문제 탭) ----------
  function parseMeta(text) {
    const m = /domain:\s*([a-z]+)\s*\|\s*level:\s*([1-3])\s*\|\s*minutes:\s*(\d+)/.exec(text);
    return m ? { domain: m[1], level: Number(m[2]), minutes: Number(m[3]) } : null;
  }

  // 렌더링된 마크다운을 h2 단위 카드로 나눈다.
  // onH2(h2) 가 { section, ... } 을 돌려주면 그 카드를 쓰고(h2 배치도 onH2 책임), null 이면 일반 카드에 넣는다.
  // onNode(node, current) 가 true 를 돌려주면 그 노드는 카드에 넣지 않는다.
  function splitSections(content, onH2, onNode) {
    const nodes = Array.from(content.childNodes);
    content.textContent = "";
    const block = () => {
      const section = document.createElement("section");
      section.className = "md-block md";
      return { section };
    };
    let current = null;
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "H2") {
        current = onH2 ? onH2(node) : null;
        if (!current) {
          current = block();
          current.section.appendChild(node);
        }
        content.appendChild(current.section);
        continue;
      }
      if (!current) {
        current = block();
        content.appendChild(current.section);
      }
      if (onNode && onNode(node, current)) continue;
      current.section.appendChild(node);
    }
  }

  function classifyDetails(root) {
    root.querySelectorAll("details").forEach((d) => {
      const s = d.querySelector("summary");
      const label = s ? s.textContent.trim() : "";
      if (label.startsWith("정답")) d.classList.add("solution");
      else if (label.startsWith("힌트")) d.classList.add("hint");
    });
  }

  function renderNotes(entry, md) {
    const content = $("#notes-content");
    content.innerHTML = renderMarkdown(stripFrontMatter(md));
    const h1 = content.querySelector("h1");
    if (h1) h1.remove();
    const toc = [];
    splitSections(content, (h2) => {
      h2.id = `n${toc.length + 1}`;
      toc.push({ id: h2.id, text: h2.textContent.trim() });
      return null;
    });
    classifyDetails(content);
    enhanceCode(content);
    externalLinks(content);
    $("#notes-toc").innerHTML = toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join("");

    const key = `D${entry.day}`;
    const box = $("#notes-read");
    box.checked = Boolean(store.get("read", {})[key]);
    box.addEventListener("change", () => setIn("read", key, box.checked ? Date.now() : null));
  }

  function renderProblems(entry, md, domains) {
    const content = $("#day-content");
    content.innerHTML = renderMarkdown(stripFrontMatter(md));
    const h1 = content.querySelector("h1");
    if (h1) h1.remove();
    const done = doneMap();
    const flags = flagMap();
    // "Q1. ..." 은 문제 카드, 나머지 h2 는 일반 카드
    splitSections(
      content,
      (h2) => {
        const m = /^(Q\d+)\.\s*(.*)$/.exec(h2.textContent.trim());
        if (!m) return null;
        const id = pid(entry.day, m[1]);
        const section = document.createElement("section");
        section.className = "problem md";
        section.id = m[1].toLowerCase();
        section.dataset.pid = id;
        section.innerHTML = `
          <div class="problem-head">
            <div><div class="badges"></div></div>
            <div class="problem-actions">
              <label class="done-toggle"><input type="checkbox"${done[id] ? " checked" : ""}> 완료</label>
              <button type="button" class="flag-toggle" aria-pressed="${flags[id] ? "true" : "false"}">${flags[id] ? "★" : "☆"} 다시 보기</button>
            </div>
          </div>`;
        section.querySelector(".problem-head > div").prepend(h2);
        if (done[id]) section.classList.add("is-done");
        return { section, isProblem: true, meta: null };
      },
      (node, current) => {
        if (node.nodeType !== Node.COMMENT_NODE || !current.isProblem || current.meta) return false;
        const meta = parseMeta(node.textContent);
        if (!meta) return false;
        current.meta = meta;
        current.section.querySelector(".badges").innerHTML =
          `${domainBadge(meta.domain, domains)}<span class="badge">${LEVEL[meta.level]}</span><span class="badge">⏱ ${meta.minutes}분</span>`;
        return true;
      },
    );
    classifyDetails(content);
    enhanceCode(content);
    externalLinks(content);

    // 문제 바로가기 + 완료/다시 보기
    const qnav = $("#qnav");
    const problems = Array.from(content.querySelectorAll(".problem"));
    qnav.innerHTML = problems
      .map((s) => `<a href="#${s.id}" data-pid="${s.dataset.pid}">${s.id.toUpperCase()}</a>`)
      .join("");
    const syncNav = () => {
      const map = doneMap();
      qnav.querySelectorAll("a").forEach((a) => a.classList.toggle("done", Boolean(map[a.dataset.pid])));
    };
    problems.forEach((s) => {
      const id = s.dataset.pid;
      s.querySelector(".done-toggle input").addEventListener("change", (ev) => {
        setIn("done", id, ev.target.checked ? Date.now() : null);
        s.classList.toggle("is-done", ev.target.checked);
        syncNav();
      });
      const flag = s.querySelector(".flag-toggle");
      flag.addEventListener("click", () => {
        const on = flag.getAttribute("aria-pressed") !== "true";
        setIn("flag", id, on ? Date.now() : null);
        flag.setAttribute("aria-pressed", String(on));
        flag.textContent = `${on ? "★" : "☆"} 다시 보기`;
      });
    });
    syncNav();

    // 정답 모두 펼치기/접기
    const toggleAll = $("#toggle-solutions");
    toggleAll.addEventListener("click", () => {
      const sols = Array.from(content.querySelectorAll("details.solution"));
      const open = !sols.every((d) => d.open);
      sols.forEach((d) => (d.open = open));
      toggleAll.textContent = open ? "정답 모두 접기" : "정답 모두 펼치기";
    });

    initTimer(entry.problems.reduce((s, p) => s + p.minutes, 0));
  }

  function initTabs(hasNotes, initial) {
    const tabs = { notes: $("#tab-notes"), problems: $("#tab-problems") };
    const panels = { notes: $("#panel-notes"), problems: $("#panel-problems") };
    tabs.notes.hidden = !hasNotes;
    const show = (view, fromClick) => {
      for (const k of Object.keys(tabs)) {
        const on = k === view;
        tabs[k].setAttribute("aria-selected", String(on));
        tabs[k].tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      }
      if (fromClick) {
        const url = new URL(location.href);
        url.searchParams.set("view", view);
        url.hash = "";
        history.replaceState(null, "", url);
        const top = $("#day-tabs").getBoundingClientRect().top + window.scrollY - 64;
        if (window.scrollY > top) window.scrollTo(0, top);
      }
    };
    tabs.notes.addEventListener("click", () => show("notes", true));
    tabs.problems.addEventListener("click", () => show("problems", true));
    show(initial, false);
    return show;
  }

  async function initDay() {
    const root = $("#day");
    const params = new URLSearchParams(location.search);
    let manifest, curriculum;
    try {
      [manifest, curriculum] = await Promise.all([getJSON("days/manifest.json"), getJSON("data/curriculum.json")]);
    } catch (e) {
      showError(root, e);
      return;
    }
    const domains = domainMap(curriculum);
    const days = manifest.days.slice().sort((a, b) => a.day - b.day);
    if (!days.length) {
      root.innerHTML = `<div class="empty">아직 만들어진 문제가 없습니다.</div>`;
      return;
    }
    const want = Number(params.get("d")) || days[days.length - 1].day;
    const entry = days.find((d) => d.day === want);
    if (!entry) {
      showError(root, new Error(`Day ${want} 은(는) 아직 없습니다.`));
      return;
    }
    let problemsMd, notesMd;
    try {
      [problemsMd, notesMd] = await Promise.all([getText(entry.file), entry.study ? getText(entry.study) : null]);
    } catch (e) {
      showError(root, e);
      return;
    }
    document.title = `Day ${entry.day} · ${entry.title} — CKA Daily`;
    const totalMin = entry.problems.reduce((s, p) => s + p.minutes, 0);
    $("#day-head").innerHTML = `
      <div class="eyebrow">Day ${entry.day} · ${esc(entry.date)} · ${esc(entry.focus)}</div>
      <h1>${esc(entry.title)}</h1>
      <p class="muted" style="margin:0">${esc(entry.summary)}</p>`;
    $("#problems-count").textContent = `${entry.problems.length}문제 · ${totalMin}분`;
    if (entry.study_minutes) $("#notes-count").textContent = `약 ${entry.study_minutes}분`;

    if (notesMd) renderNotes(entry, notesMd);
    renderProblems(entry, problemsMd, domains);

    let view = params.get("view");
    if (view !== "notes" && view !== "problems") view = location.hash.startsWith("#q") || !notesMd ? "problems" : "notes";
    if (!notesMd) view = "problems";
    const show = initTabs(Boolean(notesMd), view);
    $("#go-problems").addEventListener("click", () => show("problems", true));

    // 이전/다음 Day
    const idx = days.indexOf(entry);
    const prev = days[idx - 1];
    const next = days[idx + 1];
    $("#pager").innerHTML = `
      <span>${prev ? `<a class="btn secondary" href="day.html?d=${prev.day}">← Day ${prev.day}</a>` : ""}</span>
      <span>${next ? `<a class="btn secondary" href="day.html?d=${next.day}">Day ${next.day} →</a>` : ""}</span>`;

    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  function initTimer(totalMin) {
    const clock = $("#timer-clock");
    const startBtn = $("#timer-start");
    const resetBtn = $("#timer-reset");
    const limit = totalMin * 60;
    let elapsed = 0;
    let handle = null;
    const render = () => {
      const left = limit - elapsed;
      const abs = Math.abs(left);
      clock.textContent = `${left < 0 ? "+" : ""}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
      clock.classList.toggle("over", left < 0);
    };
    startBtn.addEventListener("click", () => {
      if (handle) {
        clearInterval(handle);
        handle = null;
        startBtn.textContent = "계속";
      } else {
        handle = setInterval(() => {
          elapsed += 1;
          render();
        }, 1000);
        startBtn.textContent = "일시정지";
      }
    });
    resetBtn.addEventListener("click", () => {
      clearInterval(handle);
      handle = null;
      elapsed = 0;
      startBtn.textContent = "타이머 시작";
      render();
    });
    render();
  }

  // ---------- 로드맵 ----------
  async function initRoadmap() {
    const root = $("#roadmap");
    let plan, manifest, curriculum;
    try {
      [plan, manifest, curriculum] = await Promise.all([
        getJSON("data/plan.json"),
        getJSON("days/manifest.json"),
        getJSON("data/curriculum.json"),
      ]);
    } catch (e) {
      showError(root, e);
      return;
    }
    const domains = domainMap(curriculum);
    const ready = new Set(manifest.days.map((d) => d.day));
    const nextDay = Math.max(0, ...ready) + 1;
    let html = "";
    let week = 0;
    for (const d of plan.days) {
      const w = Math.ceil(d.day / 7);
      if (w !== week) {
        week = w;
        html += `<div class="road-week">${w}주차</div>`;
      }
      const isReady = ready.has(d.day);
      const status = isReady
        ? `<a href="day.html?d=${d.day}&view=notes">노트</a> · <a href="day.html?d=${d.day}&view=problems">문제</a>`
        : d.day === nextDay
          ? `<span class="badge" style="color:var(--accent-text)">다음 차례</span>`
          : `<span class="muted">예정</span>`;
      html += `
        <details class="road-item ${isReady ? "ready" : ""}">
          <summary>
            <div class="day-num"><div><small>DAY</small>${d.day}</div></div>
            <div><div style="font-weight:600">${esc(d.title)}</div>
              <div class="badges" style="margin-top:4px"><span class="badge">${esc(d.section)}</span>${d.domains
                .map((id) => domainBadge(id, domains))
                .join("")}</div></div>
            <div class="status">${status}</div>
          </summary>
          <div class="body">
            <h4>다룰 주제</h4>
            <ul>${d.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
            <h4>KodeKloud 강의 노트</h4>
            <ul>${d.lessons
              .map((l) => `<li><a href="${esc(plan.kodekloud_base + l.path)}" target="_blank" rel="noopener">${esc(l.title)}</a></li>`)
              .join("")}</ul>
            ${
              d.docs.length
                ? `<h4>공식 문서</h4><ul>${d.docs
                    .map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`)
                    .join("")}</ul>`
                : ""
            }
          </div>
        </details>`;
    }
    root.innerHTML = html;
    $("#roadmap-format").textContent = plan.daily_format;
  }

  // ---------- 시험 가이드 ----------
  async function initGuide() {
    const root = $("#guide");
    let curriculum, md;
    try {
      [curriculum, md] = await Promise.all([getJSON("data/curriculum.json"), getText("pages/guide.md")]);
    } catch (e) {
      showError(root, e);
      return;
    }
    const ex = curriculum.exam;
    $("#exam-facts").innerHTML = `
      <dl class="kv">
        <dt>형식</dt><dd>${esc(ex.format)}</dd>
        <dt>Kubernetes</dt><dd>${esc(ex.k8s_version)}</dd>
        <dt>시간</dt><dd>${ex.duration_minutes}분</dd>
        <dt>문항</dt><dd>${esc(ex.tasks)}</dd>
        <dt>합격 점수</dt><dd>${ex.passing_score}% 이상</dd>
        <dt>결과 발표</dt><dd>${esc(ex.result)}</dd>
        <dt>포함 사항</dt><dd>${esc(ex.includes)}</dd>
        <dt>유효 기간</dt><dd>${esc(ex.validity)}</dd>
        <dt>응시료</dt><dd>$${ex.price_usd}</dd>
      </dl>
      <p class="muted small" style="margin:12px 0 0">공식 사이트 기준 확인일: ${esc(curriculum.verified_at)} ·
        ${ex.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(" · ")}</p>`;
    $("#exam-env").innerHTML = `
      <ul class="comp-list">${ex.environment.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3 style="font-size:15px;margin:16px 0 4px">시험 중 열람 가능한 문서</h3>
      <ul class="comp-list">${ex.allowed_docs
        .map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`)
        .join("")}</ul>`;
    $("#domains").innerHTML = curriculum.domains
      .map(
        (d) => `<div class="domain-bar d-${d.id}" style="margin-bottom:16px">
          <div class="top"><span class="name">${esc(d.ko)} <span class="muted" style="font-weight:400">${esc(d.name)}</span></span>
          <span style="font-weight:700">${d.weight}%</span></div>
          <div class="bar"><span style="width:${d.weight * 2}%"></span></div>
          <ul class="comp-list">${d.competencies.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`,
      )
      .join("");
    const body = $("#guide-md");
    body.innerHTML = renderMarkdown(md);
    enhanceCode(body);
    externalLinks(body);
  }

  // ---------- 시작 ----------
  initThemeToggle();
  const nav = document.querySelector(`.site-nav a[data-nav="${page}"]`);
  if (nav) nav.setAttribute("aria-current", "page");
  const routes = { index: initIndex, day: initDay, roadmap: initRoadmap, guide: initGuide };
  if (routes[page]) routes[page]();
})();
