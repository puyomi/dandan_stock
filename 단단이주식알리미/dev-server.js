// 로컬 개발 서버 (vercel 없이 전체 앱 실행용)
// 정적 파일 + /api/* 서버리스 핸들러를 그대로 마운트한다.
//   실행: npm run dev  →  http://localhost:3000
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// api 핸들러 캐시 (동적 import)
const handlers = {};
async function getHandler(name) {
  if (!handlers[name]) {
    const mod = await import(`./api/${name}.js`);
    handlers[name] = mod.default;
  }
  return handlers[name];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ---- API 라우팅 ----
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/\/$/, "");
    try {
      const handler = await getHandler(name);
      const query = Object.fromEntries(url.searchParams.entries());
      const shimRes = {
        statusCode: 200,
        _headers: {},
        setHeader(k, v) {
          this._headers[k] = v;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(obj) {
          res.writeHead(this.statusCode, {
            "Content-Type": "application/json; charset=utf-8",
            ...this._headers,
          });
          res.end(JSON.stringify(obj));
        },
      };
      await handler({ query, method: req.method }, shimRes);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "handler error", detail: String(e) }));
    }
    return;
  }

  // ---- 정적 파일 ----
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const buf = await readFile(join(__dirname, path));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`단단이 주식 알리미 → http://localhost:${PORT}`);
});
