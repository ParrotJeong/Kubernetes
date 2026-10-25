# CKA Daily 저장소

CKA(Certified Kubernetes Administrator) 시험 준비용 저장소다. `docs/` 가 GitHub Pages 사이트이고,
사용자가 매일 아침 요청하면 Claude 가 그날의 실기형 문제를 만들어 올린다.

- 사이트: https://parrotjeong.github.io/Kubernetes/
- 대화와 해설은 한국어로 쓴다. 문제 본문(Task)은 실제 시험처럼 영어로 쓰고 한국어 요약을 붙인다.

## 매일 문제 요청

"오늘 CKA 문제 만들어줘", "오늘 문제", "Day N 문제", "모의고사 만들어줘" 같은 요청은
`.claude/skills/cka-daily/SKILL.md` 절차를 따른다. 사용자가 어려웠다고 말한 주제는 `notes/feedback.md` 에 기록한다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `docs/index.html`, `day.html`, `roadmap.html`, `guide.html`, `docs/assets/` | 정적 사이트. 빌드 없음, `docs/.nojekyll` 로 Jekyll 끔 |
| `docs/days/day-NNN.md` | Day 별 문제 |
| `docs/days/manifest.json` | `python3 scripts/cka.py build` 가 생성한다. 직접 고치지 않는다 |
| `docs/data/curriculum.json` | 공식 시험 정보·도메인·비중 (`verified_at` 은 공식 페이지 확인일) |
| `docs/data/plan.json` | 33일 로드맵 (KodeKloud CKA 강의 순서) |
| `docs/pages/guide.md` | 시험 가이드 페이지 본문 |
| `notes/feedback.md` | 사용자 피드백 → 복습 문제에 반영 |
| `scripts/cka.py` | `next` / `build` / `check-links` / `yaml` |
| `scripts/sandbox.sh`, `scripts/fake_kubelet.py` | 정답 검증용 로컬 컨트롤 플레인 |

## 게시 규칙

GitHub Pages 는 `main` 브랜치의 `/docs` 폴더를 배포한다(Settings → Pages → Deploy from a branch → `main` / `/docs`).
작업은 세션에 지정된 브랜치에서 커밋하고 push 한다.

## 사이트 코드를 고칠 때

- 외부 라이브러리는 `docs/assets/vendor/` 에 고정 버전으로 둔다(marked 15.0.12, highlight.js 11.11.1). CDN 에 의존하지 않는다.
- 진도·시험일·테마는 브라우저 localStorage(`cka:` 접두사)에만 저장한다.
- 고친 뒤에는 `python3 -m http.server -d docs` 로 띄워 Playwright 로 데스크톱·모바일·다크 모드와 콘솔 에러를 확인한다.

## 공식 정보 갱신

시험 버전이나 커리큘럼이 바뀌면(Linux Foundation CKA 페이지와 `docs.linuxfoundation.org` 확인)
`docs/data/curriculum.json` 의 값과 `verified_at` 을 고치고, 샌드박스 버전(`scripts/sandbox.sh` 의 `K8S_VERSION`)도 맞춘다.
