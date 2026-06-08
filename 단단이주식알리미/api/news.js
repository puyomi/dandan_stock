// 키워드 뉴스 프록시 (Vercel Serverless Function)
// 입력: /api/news?companies=삼성전자,한전KPS&keywords=증설,해외진출,신규고객,수주
// 출력: { items: [{ id, title, link, pubDate, company, matchedKeyword }] }
//
// 1순위: 네이버 뉴스 검색 Open API (환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)
// 대체:  Google News RSS (키 불필요)
//
// 동작: 회사명으로 최신 기사를 받아온 뒤, 제목+요약에 키워드(유사어 포함)가
//       들어있는 기사만 골라낸다. → 회사당 1회 호출로 모든 키워드 조합을 커버.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 키워드 유사어 확장
const SYNONYMS = {
  증설: ["증설", "증산", "생산능력", "캐파", "capa", "라인 증설", "공장 신설", "신규 공장", "양산"],
  해외진출: ["해외진출", "수출", "글로벌 진출", "해외 수주", "현지 법인", "해외 공장", "북미", "유럽 진출"],
  신규고객: ["신규 고객", "신규고객", "고객사 확보", "공급계약", "공급 계약", "납품", "거래 시작"],
  수주: ["수주", "공급계약", "공급 계약", "납품", "계약 체결", "대규모 계약", "공급"],
};

function expandKeywords(keywords) {
  const out = new Map(); // synonym(lower) -> base keyword
  for (const base of keywords) {
    const list = SYNONYMS[base] || [base];
    for (const s of list) out.set(s.toLowerCase(), base);
  }
  return out;
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

// 제목+요약에서 일치하는 base 키워드 찾기
function matchKeyword(text, expanded) {
  const lower = text.toLowerCase();
  for (const [syn, base] of expanded) {
    if (lower.includes(syn)) return base;
  }
  return null;
}

// 네이버 뉴스 검색 API
async function fetchNaver(company, id, secret) {
  const url =
    "https://openapi.naver.com/v1/search/news.json?display=30&sort=date&query=" +
    encodeURIComponent(company);
  const r = await fetch(url, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
  });
  if (!r.ok) throw new Error(`naver ${r.status}`);
  const d = await r.json();
  return (d.items || []).map((it) => ({
    title: stripTags(it.title),
    desc: stripTags(it.description),
    link: it.originallink || it.link,
    pubDate: it.pubDate || null,
  }));
}

// Google News RSS (키 불필요 대체재)
async function fetchGoogle(company) {
  const url =
    "https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&q=" +
    encodeURIComponent(company + " when:14d");
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const xml = await r.text();
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 30) {
    const block = m[1];
    const pick = (tag) => {
      const mm = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      if (!mm) return "";
      return stripTags(mm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    };
    items.push({
      title: pick("title"),
      desc: pick("description"),
      link: pick("link"),
      pubDate: pick("pubDate") || null,
    });
  }
  return items;
}

export default async function handler(req, res) {
  const companies = (req.query.companies || "")
    .toString()
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 30);
  const keywords = (req.query.keywords || "증설,해외진출,신규고객,수주")
    .toString()
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!companies.length) {
    res.status(400).json({ error: "companies 파라미터가 필요합니다" });
    return;
  }

  const expanded = expandKeywords(keywords);
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  const source = id && secret ? "naver" : "google";

  const perCompany = await Promise.all(
    companies.map(async (company) => {
      try {
        const raw =
          source === "naver"
            ? await fetchNaver(company, id, secret)
            : await fetchGoogle(company);
        const hits = [];
        for (const a of raw) {
          const matched = matchKeyword(`${a.title} ${a.desc}`, expanded);
          if (!matched) continue;
          hits.push({
            id: a.link, // 링크를 고유 id로 사용 (신규 강조용)
            title: a.title,
            link: a.link,
            pubDate: a.pubDate,
            company,
            matchedKeyword: matched,
          });
        }
        return hits;
      } catch (e) {
        return [];
      }
    })
  );

  // 평탄화 + 링크 기준 중복 제거 + 최신순
  const seen = new Set();
  const items = [];
  for (const arr of perCompany) {
    for (const it of arr) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      items.push(it);
    }
  }
  items.sort((a, b) => {
    const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
    const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
    return tb - ta;
  });

  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
  res.status(200).json({ items: items.slice(0, 100), source });
}
