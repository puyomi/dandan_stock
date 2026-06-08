// 종목 검색 (자동완성) 프록시 — 이름으로 종목코드 찾기
// 입력: /api/search?q=삼성전자
// 출력: { results: [{ code, name, market }] }

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export default async function handler(req, res) {
  const q = (req.query.q || "").toString().trim();
  if (!q) {
    res.status(200).json({ results: [] });
    return;
  }
  try {
    const url =
      "https://ac.stock.naver.com/ac?target=stock,index,marketindicator&q=" +
      encodeURIComponent(q);
    const r = await fetch(url, {
      headers: { "User-Agent": UA, referer: "https://m.stock.naver.com/" },
    });
    if (!r.ok) throw new Error(`ac ${r.status}`);
    const d = await r.json();
    const items = (d.items || []).flatMap((group) => group.list || group || []);
    const results = items
      .map((it) => ({
        code: it.code,
        name: it.name,
        market: it.typeName || it.nationName || it.reutersCode || "",
      }))
      .filter((x) => x.code && /^[0-9A-Z]{6}$/.test(x.code))
      .slice(0, 12);
    res.setHeader("Cache-Control", "s-maxage=600");
    res.status(200).json({ results });
  } catch (e) {
    res.status(200).json({ results: [], error: String(e) });
  }
}
