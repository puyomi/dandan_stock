// 네이버 금융 시세 프록시 (Vercel Serverless Function)
// 입력: /api/quotes?codes=005930,000660,051600,0132H0
// 출력: { quotes: [{ code, name, price, change, changeRate, state }], asOf }
//
// ⚠️ 네이버 시세는 비공식 엔드포인트다. 개인/내부용 폴링은 통상 문제되지 않으나
//    약관상 회색지대이며 차단/변경 시 아래 엔드포인트 순서를 수정해야 한다.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 콤마/공백 섞인 숫자 문자열 → number
function toNum(v) {
  if (v === null || v === undefined) return NaN;
  const n = parseFloat(String(v).replace(/[,\s%+]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// 후보 1: m.stock.naver.com (가장 안정적, 종목/ETF 공통)
async function fetchMobile(code) {
  const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      referer: `https://m.stock.naver.com/domestic/stock/${code}/total`,
      accept: "application/json",
    },
  });
  if (!r.ok) throw new Error(`mobile ${r.status}`);
  const d = await r.json();
  const price = toNum(d.closePrice);
  let change = toNum(d.compareToPreviousClosePrice);
  const rate = toNum(d.fluctuationsRatio);
  // compareToPreviousPrice.code: "2"/"1" 상승, "5"/"4" 하락 → 부호 보정
  const dirCode = d.compareToPreviousPrice && d.compareToPreviousPrice.code;
  if (Number.isFinite(change)) {
    if (dirCode === "5" || dirCode === "4") change = -Math.abs(change);
    else if (dirCode === "2" || dirCode === "1") change = Math.abs(change);
  }
  const changeRate =
    Number.isFinite(rate) && (dirCode === "5" || dirCode === "4")
      ? -Math.abs(rate)
      : rate;
  if (!Number.isFinite(price)) throw new Error("mobile parse");
  return {
    code,
    name: d.stockName || d.itemName || code,
    price,
    change: Number.isFinite(change) ? change : null,
    changeRate: Number.isFinite(changeRate) ? changeRate : null,
    state: d.marketStatus || null,
  };
}

// 후보 2: polling.finance.naver.com (실시간 폴링용)
async function fetchPolling(code) {
  const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA, referer: "https://finance.naver.com/" },
  });
  if (!r.ok) throw new Error(`polling ${r.status}`);
  const d = await r.json();
  const row =
    (d.datas && d.datas[0]) ||
    (d.result && d.result.areas && d.result.areas[0].datas[0]);
  if (!row) throw new Error("polling empty");
  const price = toNum(row.nv ?? row.closePrice);
  let change = toNum(row.cv ?? row.compareToPreviousClosePrice);
  let rate = toNum(row.cr ?? row.fluctuationsRatio);
  // rf/ rate sign: "5" 하락
  const rf = row.rf;
  if (rf === "5" || rf === "4") {
    change = -Math.abs(change);
    rate = -Math.abs(rate);
  }
  if (!Number.isFinite(price)) throw new Error("polling parse");
  return {
    code,
    name: row.nm || code,
    price,
    change: Number.isFinite(change) ? change : null,
    changeRate: Number.isFinite(rate) ? rate : null,
    state: row.ms || null,
  };
}

async function fetchOne(code) {
  const errors = [];
  for (const fn of [fetchMobile, fetchPolling]) {
    try {
      return await fn(code);
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { code, name: code, price: null, change: null, changeRate: null, error: errors.join(" | ") };
}

export default async function handler(req, res) {
  const codesRaw = (req.query.codes || "").toString().trim();
  if (!codesRaw) {
    res.status(400).json({ error: "codes 파라미터가 필요합니다 (예: ?codes=005930,000660)" });
    return;
  }
  const codes = [...new Set(codesRaw.split(",").map((c) => c.trim()).filter(Boolean))].slice(0, 50);

  try {
    const quotes = await Promise.all(codes.map(fetchOne));
    // 짧은 캐시로 네이버 호출 절감 (장중 8초)
    res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
    res.status(200).json({ quotes, asOf: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: "시세 조회 실패", detail: String(e) });
  }
}
