# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 안내서입니다.

## 프로젝트 개요
**단단이 주식 알리미** — 한국 주식·ETF의 실시간 시세를 한 화면에서 보고, 전일 종가 대비
등락률에 따라 색상으로 강조하는 웹 대시보드. 추가로 각 종목(회사)에 대한 키워드 뉴스
(증설·해외진출·신규고객/수주)를 모아 보여주고 새 기사를 NEW로 강조한다.

- 데이터: **네이버 금융**(비공식 엔드포인트) — 시세/검색, 뉴스는 네이버 뉴스 API 또는 Google News RSS
- 호스팅: **Vercel**(정적 프론트 + 서버리스 함수). 프레임워크 없음(바닐라 JS).
- 상태 저장: 브라우저 **localStorage** (서버 DB 없음)

## 실행 / 배포
```powershell
node dev-server.js     # 로컬: http://localhost:3000  (vercel 불필요)
# 또는
npm run dev            # = node dev-server.js
npm run vercel-dev     # vercel CLI 설치 시
npm run deploy         # vercel --prod
```
- 배포는 GitHub 저장소를 Vercel에 Import → push 시 자동 재배포.
- ⚠️ GitHub 업로드 시 파일이 **저장소 최상위(root)** 에 있어야 한다. 한 폴더 더 들어가면
  Vercel이 `index.html`을 못 찾아 **404 NOT_FOUND**가 난다(또는 Vercel Root Directory 설정).

## 구조
```
index.html        # 대시보드 UI (정적)
app.js            # 프론트 로직: 폴링, 색상 판정, 종목/키워드 관리, 뉴스 렌더
styles.css        # 등락 단계별 색상 + 레이아웃
dev-server.js     # vercel 없이 로컬 실행용 Node http 서버 (api/* 핸들러 마운트)
api/quotes.js     # 시세 프록시:  ?codes=005930,000660 → 정규화 JSON
api/news.js       # 뉴스 프록시:  ?companies=..&keywords=.. → 일치 기사
api/search.js     # 종목 자동완성: ?q=삼성전자 → {code,name,market}[]
vercel.json       # 서버리스 함수 설정
```

## 핵심 규칙 / 주의사항
- **ESM**: `package.json`에 `"type":"module"`. api 핸들러는 `export default function(req,res)`.
  `req.query`(객체), `res.status().json()` 사용 — Vercel/Node 스타일. `dev-server.js`가 동일 시그니처로 shim 제공.
- **색상 단계** (`app.js`의 `levelClass()` + `styles.css`의 `.lv-*`):
  상승 `+10%↑ / +5~10% / 0~+5%`(빨강 계열), 보합, 하락 `0~-5%`(연초록) `-5~-10%`(초록)
  `-10~-15%`(하늘색) `-15%↓`(남색). 최대 변동(+10%/-15%)은 펄스 애니메이션으로 초강조.
  → 임계값/색을 바꾸려면 **세 곳을 같이** 수정: `levelClass()`, `--*-bg` 변수, 범례 칩(index.html).
- **네이버 시세 비공식**: `api/quotes.js`는 `m.stock.naver.com/api/stock/{code}/basic`을 1순위,
  `polling.finance.naver.com`을 fallback으로 호출. 네이버가 막거나 응답 형식을 바꾸면 여기를 고친다.
  안정성이 중요해지면 한국투자증권 Open API(공식)로 교체.
- **뉴스 소스 자동 전환**: 환경변수 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`가 있으면 네이버 뉴스 API,
  없으면 Google News RSS. 회사명으로 최근 기사를 받아 제목+요약에 키워드(유사어 포함)가 있으면 채택.
  유사어는 `api/news.js`의 `SYNONYMS` 맵에서 관리.
- **localStorage 키**: `dandani.stocks`, `dandani.keywords`, `dandani.seenNews`(NEW 판별용).
- 종목코드는 6자리(예: `005930`, ETF `0132H0`). 6자리면 바로 추가, 아니면 `/api/search` 자동완성.

## 검증된 사실 (2026-06-08 기준)
- 기본 종목: 삼성전자 `005930`, SK하이닉스 `000660`, 한전KPS `051600`, KODEX 미국원자력SMR `0132H0`.
- 네 종목 시세 정규화, 자동완성, Google News RSS 파싱 모두 로컬에서 동작 확인됨.
- 폴링 주기: 시세 15초, 뉴스 4분. 뉴스 검색 창은 14일.

## 폴링 / 배치 작업 시
- 시세 API는 `s-maxage=8`, 뉴스는 `s-maxage=120` 캐시. 폴링 주기를 줄일 때 네이버 과호출 주의.
- 상업적 대량 호출은 네이버 약관 위반 소지가 있으므로 피한다.
