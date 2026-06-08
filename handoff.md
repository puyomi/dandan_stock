# 인수인계 (Handoff)

작성일: 2026-06-08 · 작성: Claude Code · 프로젝트: 단단이 주식 알리미

## 한 줄 요약
한국 주식 실시간 시세 대시보드(색상 강조 + 키워드 뉴스). 코드는 완성·로컬 검증 완료.
**남은 일은 "GitHub 업로드 구조 문제 해결 → Vercel 배포" 한 가지**.

## 지금 상태
- [x] 프론트엔드(시세 카드, 7→상승3/하락4 색상 단계, 종목 추가·삭제, 뉴스 패널, NEW 강조)
- [x] 백엔드 서버리스 함수 3종: `api/quotes.js`(시세), `api/news.js`(뉴스), `api/search.js`(종목검색)
- [x] 로컬 개발 서버 `dev-server.js` (vercel 없이 `node dev-server.js`로 전체 실행)
- [x] 외부 엔드포인트·파싱 실측 검증(네이버 시세/자동완성, Google News RSS)
- [x] 색상 변경 반영: 하락 `-5%초록 / -10%하늘색 / -15%남색`(+ 0~-5% 연초록)
- [ ] **GitHub 업로드 (진행 중 — 아래 이슈 참고)**
- [ ] **Vercel 배포 (404 해결 후)**

## ⚠️ 지금 막혀 있는 지점 — Vercel 404 NOT_FOUND
사용자가 배포 시도 중 `404: NOT_FOUND (Code: NOT_FOUND, icn1...)` 화면을 봤다.
배포 자체는 됐으나 **최상위에서 `index.html`을 못 찾는 상태**.

**원인(거의 확실)**: GitHub에 올릴 때 폴더(`단단이주식알리미`)째 드래그해서, 저장소 구조가
`/단단이주식알리미/index.html`처럼 **한 겹 더 들어가** 있음. Vercel root에 index.html이 없음.

**해결 둘 중 하나**:
1. Vercel → 프로젝트 → Settings → **Root Directory** 를 그 하위 폴더로 지정 → Redeploy.
2. (권장) 저장소를 다시 만들어 **폴더 안의 파일들만** 최상위에 올린다
   (탐색기에서 폴더를 연 뒤 `api`, `index.html`, `app.js` … 를 선택해 업로드).

검증: GitHub 저장소 첫 화면에 `index.html`이 **바로** 보이면 정상. 폴더 하나만 보이면 문제.

## 다음 작업자가 할 일
1. 위 404(업로드 구조) 해결 → Vercel 자동 재배포 → `xxxx.vercel.app` 정상 표시 확인.
2. (선택) 네이버 뉴스 품질 ↑: Vercel 환경변수 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 추가 후 재배포.
   미설정 시 Google News RSS로 자동 동작(이미 검증됨).

## 사용자가 추가로 원할 수 있는 기능 (미구현)
- 브라우저 푸시 알림(창 닫아도 새 뉴스 알림)
- 이메일/슬랙으로 뉴스·급변 알림 발송
- 시세 급변(±10% 등) 도달 시 별도 알림

## 알아둘 리스크
- **네이버 시세는 비공식 엔드포인트**. 차단/형식 변경 시 `api/quotes.js` 수정 필요.
  상업적 대량 호출 금지. 안정성 필요하면 한국투자증권 Open API(공식)로 교체.
- 표시 시세는 지연 가능 — 투자 판단의 유일 근거로 쓰지 말 것.

## 빠른 실행
```powershell
cd C:\Users\User\Desktop\단단이주식알리미
node dev-server.js     # http://localhost:3000
```
세부 구조·규칙은 `CLAUDE.md`, 사용자용 안내는 `README.md` 참고.
