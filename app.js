"use strict";

/* ---------- 기본값 & 저장소 ---------- */
const DEFAULT_STOCKS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
  { code: "051600", name: "한전KPS" },
  { code: "0132H0", name: "KODEX 미국원자력SMR" },
];
const DEFAULT_KEYWORDS = ["증설", "해외진출", "신규고객", "수주"];

const QUOTE_INTERVAL = 15000; // 15초
const NEWS_INTERVAL = 240000; // 4분
const ACCESS_CODE = "1553"; // 입장 인증코드 (클라이언트 검사 — 소스에 노출됨)

const LS = {
  stocks: "dandani.stocks",
  keywords: "dandani.keywords",
  seen: "dandani.seenNews",
  auth: "dandani.auth",
};

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

let stocks = load(LS.stocks, DEFAULT_STOCKS);
let keywords = load(LS.keywords, DEFAULT_KEYWORDS);
let seenNews = new Set(load(LS.seen, []));
let firstNewsLoad = true; // 첫 로드 때는 전체를 NEW로 안 띄움(소음 방지)

/* ---------- 유틸 ---------- */
const $ = (sel) => document.querySelector(sel);

function fmtPrice(n) {
  return n == null ? "—" : Number(n).toLocaleString("ko-KR");
}
function fmtChange(change, rate) {
  if (rate == null) return "—";
  const sign = rate > 0 ? "▲" : rate < 0 ? "▼" : "―";
  const ch = change == null ? "" : Math.abs(change).toLocaleString("ko-KR");
  return `${sign} ${ch} (${rate > 0 ? "+" : ""}${rate.toFixed(2)}%)`;
}

// 등락률 → 색상 단계 클래스
function levelClass(rate) {
  if (rate == null) return "lv-flat";
  if (rate >= 10) return "lv-up3";
  if (rate >= 5) return "lv-up2";
  if (rate > 0) return "lv-up1";
  if (rate === 0) return "lv-flat";
  if (rate > -5) return "lv-dn1"; // 0 ~ -5%   연초록
  if (rate > -10) return "lv-dn2"; // -5 ~ -10%  초록
  if (rate > -15) return "lv-dn3"; // -10 ~ -15% 하늘색
  return "lv-dn4"; // -15% 이하  남색
}

/* ---------- 시세 ---------- */
async function fetchQuotes() {
  if (!stocks.length) {
    $("#cards").innerHTML = '<p class="empty">종목을 추가해 주세요.</p>';
    return;
  }
  const codes = stocks.map((s) => s.code).join(",");
  try {
    const res = await fetch(`/api/quotes?codes=${encodeURIComponent(codes)}`);
    const data = await res.json();
    renderCards(data.quotes || []);
    $("#last-updated").textContent =
      "갱신 " + new Date(data.asOf || Date.now()).toLocaleTimeString("ko-KR");
    const st = (data.quotes || []).find((q) => q.state);
    setMarketStatus(st && st.state);
  } catch (e) {
    $("#last-updated").textContent = "갱신 실패 — 잠시 후 재시도";
  }
}

function setMarketStatus(state) {
  const el = $("#market-status");
  if (!state) {
    el.textContent = "장 상태 —";
    el.className = "pill";
    return;
  }
  const open = /OPEN/i.test(state);
  el.textContent = open ? "장중" : "장 마감";
  el.className = "pill " + (open ? "open" : "closed");
}

function renderCards(quotes) {
  const byCode = Object.fromEntries(quotes.map((q) => [q.code, q]));
  const cards = $("#cards");
  cards.innerHTML = "";
  for (const s of stocks) {
    const q = byCode[s.code] || {};
    // 종목명 자동 보정(네이버가 돌려준 이름으로 업데이트)
    if (q.name && q.name !== s.code && s.name !== q.name) {
      s.name = q.name;
    }
    const div = document.createElement("div");
    const errored = q.price == null;
    div.className = "card " + (errored ? "error" : levelClass(q.changeRate));
    div.innerHTML = `
      <button class="remove" title="삭제" data-code="${s.code}">✕</button>
      <div class="name">${escapeHtml(s.name || s.code)}</div>
      <div class="code">${s.code}</div>
      <div class="price">${errored ? "조회 불가" : fmtPrice(q.price)}</div>
      <div class="change">${errored ? "" : fmtChange(q.change, q.changeRate)}</div>
    `;
    cards.appendChild(div);
  }
  save(LS.stocks, stocks);
}

/* ---------- 종목 추가/삭제 ---------- */
function addStock(code, name) {
  code = String(code).trim().toUpperCase();
  if (!code) return;
  if (stocks.some((s) => s.code === code)) return;
  stocks.push({ code, name: name || code });
  save(LS.stocks, stocks);
  fetchQuotes();
}
function removeStock(code) {
  stocks = stocks.filter((s) => s.code !== code);
  save(LS.stocks, stocks);
  fetchQuotes();
}

$("#cards").addEventListener("click", (e) => {
  const btn = e.target.closest(".remove");
  if (btn) removeStock(btn.dataset.code);
});

/* 추가 폼: 6자리 코드면 바로 추가, 아니면 이름 검색 */
const addInput = $("#add-input");
const suggest = $("#suggest");
let searchTimer = null;

$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = addInput.value.trim();
  if (/^[0-9A-Za-z]{6}$/.test(v)) {
    addStock(v);
    addInput.value = "";
    hideSuggest();
  } else if (v) {
    runSearch(v);
  }
});

addInput.addEventListener("input", () => {
  const v = addInput.value.trim();
  clearTimeout(searchTimer);
  if (v.length < 2 || /^[0-9A-Za-z]{6}$/.test(v)) {
    hideSuggest();
    return;
  }
  searchTimer = setTimeout(() => runSearch(v), 250);
});

async function runSearch(q) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const list = data.results || [];
    if (!list.length) {
      hideSuggest();
      return;
    }
    suggest.innerHTML = list
      .map(
        (r) =>
          `<div class="suggest-item" data-code="${r.code}" data-name="${escapeHtml(
            r.name
          )}"><span>${escapeHtml(r.name)} <span class="muted">${escapeHtml(
            r.market || ""
          )}</span></span><span class="code">${r.code}</span></div>`
      )
      .join("");
    suggest.classList.remove("hidden");
  } catch {
    hideSuggest();
  }
}
function hideSuggest() {
  suggest.classList.add("hidden");
  suggest.innerHTML = "";
}
suggest.addEventListener("click", (e) => {
  const item = e.target.closest(".suggest-item");
  if (!item) return;
  addStock(item.dataset.code, item.dataset.name);
  addInput.value = "";
  hideSuggest();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#add-form")) hideSuggest();
});

/* ---------- 키워드 ---------- */
function renderKeywords() {
  $("#keyword-chips").innerHTML = keywords
    .map(
      (k) =>
        `<span class="kw">${escapeHtml(k)}<button data-kw="${escapeHtml(
          k
        )}" title="삭제">✕</button></span>`
    )
    .join("");
}
$("#keyword-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-kw]");
  if (!btn) return;
  keywords = keywords.filter((k) => k !== btn.dataset.kw);
  save(LS.keywords, keywords);
  renderKeywords();
  fetchNews();
});
$("#kw-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#kw-input").value.trim();
  if (v && !keywords.includes(v)) {
    keywords.push(v);
    save(LS.keywords, keywords);
    renderKeywords();
    fetchNews();
  }
  $("#kw-input").value = "";
});

/* ---------- 뉴스 ---------- */
async function fetchNews() {
  const companies = [...new Set(stocks.map((s) => s.name).filter(Boolean))];
  if (!companies.length || !keywords.length) {
    $("#news-list").innerHTML = '<p class="empty">감시할 종목/키워드가 없습니다.</p>';
    return;
  }
  try {
    const url =
      `/api/news?companies=${encodeURIComponent(companies.join(","))}` +
      `&keywords=${encodeURIComponent(keywords.join(","))}`;
    const res = await fetch(url);
    const data = await res.json();
    renderNews(data.items || []);
    $("#news-source").textContent =
      "출처: " + (data.source === "naver" ? "네이버 뉴스" : "Google News");
  } catch {
    $("#news-source").textContent = "뉴스 조회 실패";
  }
}

function renderNews(items) {
  const list = $("#news-list");
  if (!items.length) {
    list.innerHTML = '<p class="empty">조건에 맞는 최근 뉴스가 없습니다.</p>';
  } else {
    // 신규(미열람) 우선 정렬
    const isNew = (it) => !firstNewsLoad && !seenNews.has(it.id);
    items.sort((a, b) => Number(isNew(b)) - Number(isNew(a)));
    list.innerHTML = items
      .map((it) => {
        const newFlag = isNew(it);
        const date = it.pubDate
          ? new Date(it.pubDate).toLocaleString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        return `<a class="news-item ${newFlag ? "is-new" : ""}" href="${
          it.link
        }" target="_blank" rel="noopener">
          <div class="meta">
            ${newFlag ? '<span class="badge-new">NEW</span>' : ""}
            <span class="kw-tag">${escapeHtml(it.matchedKeyword)}</span>
            <span class="company">${escapeHtml(it.company)}</span>
            <span class="date">${date}</span>
          </div>
          <div class="title">${escapeHtml(it.title)}</div>
        </a>`;
      })
      .join("");
  }
  // 현재 받은 항목을 열람 처리(다음 폴링 때 NEW 판별 기준)
  items.forEach((it) => seenNews.add(it.id));
  save(LS.seen, [...seenNews].slice(-500));
  firstNewsLoad = false;
}

$("#mark-read").addEventListener("click", () => {
  document.querySelectorAll(".news-item.is-new").forEach((el) => {
    el.classList.remove("is-new");
    const b = el.querySelector(".badge-new");
    if (b) b.remove();
  });
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/* ---------- 입장 게이트 ---------- */
let appStarted = false;
function startApp() {
  if (appStarted) return;
  appStarted = true;
  renderKeywords();
  fetchQuotes();
  fetchNews();
  setInterval(fetchQuotes, QUOTE_INTERVAL);
  setInterval(fetchNews, NEWS_INTERVAL);
}

function unlock() {
  document.body.classList.remove("locked");
  $("#gate").classList.add("hidden");
  startApp();
}

const gateForm = $("#gate-form");
const gateInput = $("#gate-input");
const gateError = $("#gate-error");

gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (gateInput.value.trim() === ACCESS_CODE) {
    save(LS.auth, true);
    gateError.textContent = "";
    unlock();
  } else {
    gateError.textContent = "인증코드가 올바르지 않습니다.";
    const box = document.querySelector(".gate-box");
    box.classList.remove("shake");
    void box.offsetWidth; // 리플로우로 애니메이션 재시작
    box.classList.add("shake");
    gateInput.value = "";
    gateInput.focus();
  }
});

/* ---------- 시작 ---------- */
if (load(LS.auth, false) === true) {
  unlock(); // 이전에 인증한 브라우저는 바로 입장
} else {
  gateInput.focus();
}
