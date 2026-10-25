---
name: cka-daily
description: CKA 시험 대비 "오늘의 문제" 세트(실기형 5문제, 모의고사 Day 는 17문제)를 만들어 GitHub Pages 사이트(docs/)에 게시한다. 사용자가 "오늘 CKA 문제 만들어줘", "오늘 문제", "Day N 문제", "다음 문제", "모의고사 만들어줘", "복습 문제" 등을 요청하면 사용한다.
---

# CKA 오늘의 문제 만들기

사용자는 CKA 시험을 준비하고 있고, 매일 아침 이 요청을 한다. 결과물은 `docs/days/day-NNN.md` 하나이고
사이트(`https://parrotjeong.github.io/Kubernetes/`)가 이 파일을 읽어 보여준다.

## 원칙

- **근거**: 공식 커리큘럼(`docs/data/curriculum.json`, 시험 버전 `exam.k8s_version`) + 로드맵의 KodeKloud 강의 노트
  (`docs/data/plan.json`) + kubernetes.io 공식 문서. 기억에만 의존하지 말고 그날 강의 노트와 문서를 읽고 만든다.
- **실제 시험처럼**: Task 는 영어(시험 문체), 바로 아래 한국어 요약, 힌트·정답·해설은 한국어.
  환경은 Killercoda CKA Playground 기준(kubeadm, containerd, 노드 `controlplane`·`node01`, root 사용자).
- **검증한 정답만 싣는다**: 아래 "검증" 절차를 통과하지 못한 명령/YAML 은 게시하지 않는다.
- **피드백 반영**: 사용자가 어려웠다고 말한 주제는 `notes/feedback.md` 에 기록하고 복습 문제로 다시 낸다.

## 1. 다음 Day 확인

```bash
python3 scripts/cka.py next
```

다음 Day 번호, 로드맵 항목(주제·KodeKloud 강의 `page.md` URL·공식 문서), 도메인별 출제 현황,
최근 Day 문제 목록, `notes/feedback.md` 의 최근 피드백을 출력한다.

- 사용자가 특정 Day/주제를 요청하면 그것을 우선한다. 로드맵 밖 주제면 `plan.json` 은 건드리지 말고 front matter 의 `focus` 에 주제를 적는다.
- 사용자가 피드백을 줬다면(예: "어제 Q4 어려웠어") 먼저 `notes/feedback.md` 맨 아래에 한 줄 추가한다.
- 로드맵(33일)을 다 마쳤으면 약점 복습 세트나 추가 모의고사를 만든다. 무엇을 원하는지 애매하면 사용자에게 묻는다.

## 2. 자료 읽기

- KodeKloud 강의: `next` 가 출력한 `.../page.md` URL 을 `curl -sL` 로 받아 읽는다(마크다운 원문). 강의의 실습(Lab Solution) 흐름을 문제 아이디어로 쓴다.
- 공식 문서: 정답에 쓰는 필드·플래그가 현재 버전에서 맞는지 확인한다. 해설과 "📖 참고 문서" 링크는 시험 중 열람 가능한 문서(kubernetes.io/docs, kubernetes.io/blog, helm.sh/docs, gateway-api.sigs.k8s.io)로 건다.

## 3. 문제 설계

**일반 Day (5문제, 합계 25~40분)**

| 번호 | 내용 |
| --- | --- |
| Q1~Q3 | 오늘 주제. 난이도 1~3 을 섞는다 |
| Q4 | 오늘 주제의 트러블슈팅. "사전 준비" 명령으로 고장 난 상태를 만든 뒤 고치게 한다 (`domain: troubleshooting`) |
| Q5 | 복습. 이미 배운 Day 주제 중에서 시험 비중 대비 덜 나온 도메인이나 피드백 주제로 낸다. Day 1 처럼 이전 Day 가 없으면 시험 스킬(crictl, 출력 형식 등) |

**모의고사 Day (`plan.json` 에서 `"mock": true`)**: 17문제·120분. Troubleshooting 5, Cluster 4, Networking 4, Workloads 2, Storage 2.
커리큘럼 역량(`curriculum.json` 의 competencies)을 고루 다루고, 앞서 낸 문제를 그대로 반복하지 않는다.

**문제 작성 규칙**

- 이름·네임스페이스·파일 경로·출력 형식을 정확히 지정해서 채점할 수 있게 쓴다. 네임스페이스는 `dayNN`, 출력 파일은 `/opt/dayNN/` 를 쓴다.
- Day 상단 "🧰 실습 준비"에 공통 준비 명령(`mkdir -p /opt/dayNN`, `kubectl create namespace dayNN` 등)을 둔다.
- 사전 준비 명령은 Killercoda 터미널에 그대로 붙여넣어 동작해야 한다. 노드에서 할 일이 있으면 `ssh node01` 을 명시한다.
- 이미지 태그는 실제로 있는 것만 쓴다:
  `curl -s -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/library/<이미지>/tags/<태그>` 가 200 인지 확인.
- 해설에는 "왜 그렇게 하는지", "시험에서 자주 하는 실수", "다른 정답 방법"을 짧게 넣는다.

## 4. 파일 형식: `docs/days/day-NNN.md`

`docs/days/day-001.md` 를 그대로 본뜬다. `scripts/cka.py build` 가 아래 규칙을 검사한다.

```markdown
---
day: 2
date: 2026-10-26                 # 한국 시간 기준 오늘: TZ=Asia/Seoul date +%F
title: ReplicaSet · Deployment · Service · Namespace
focus: Core Concepts             # 강의 섹션 또는 주제
summary: 한 줄 요약 (대시보드에 표시)
---

# Day 2 · 제목

## 오늘의 목표
## 📚 오늘 읽을 강의          ← KodeKloud 링크(page.md 를 뺀 사람용 URL) + 공식 문서 링크
## 🧰 실습 준비               ← Killercoda 링크 + 공통 준비 명령

## Q1. 문제 제목(한국어)
<!-- domain: workloads | level: 2 | minutes: 6 -->

**작업 노드**: `controlplane`

**사전 준비** (필요할 때만)

> **Task**
>
> 영어 문제 본문

**한국어 요약**: ...

📖 참고 문서: [제목](https://kubernetes.io/docs/...)

<details>
<summary>힌트</summary>

- ...

</details>

<details>
<summary>정답 및 해설</summary>

명령/YAML → **확인** → **해설**

</details>

## ✅ 오늘의 정리               ← 오늘 쓴 명령 표
```

- 문제 제목은 `## Q<n>. 제목`, 번호는 Q1 부터 순서대로.
- 제목 바로 다음 줄에 메타 주석: `domain` 은 `troubleshooting | cluster | networking | workloads | storage`, `level` 은 1~3, `minutes` 는 권장 시간.
- 문제마다 `<summary>정답 및 해설</summary>` 블록이 있어야 한다. `<details>` 안의 마크다운은 위아래를 빈 줄로 띄운다.
- 코드 밖에서 범위를 쓸 때 `~` 는 `\~` 로 쓴다(`15\~20분`). 그냥 쓰면 GitHub 에서 취소선이 된다.
- Day 파일에 Liquid 문법을 걱정할 필요는 없다(`docs/.nojekyll` 로 Jekyll 을 끄고 있다).

## 5. 검증 (모두 통과해야 게시)

1. **샌드박스로 정답 실행**

   ```bash
   scripts/sandbox.sh up                 # 첫 실행은 바이너리 다운로드(~310MB) 때문에 1분 정도
   eval "$(scripts/sandbox.sh env)"      # KUBECONFIG, PATH 설정
   kubectl get nodes                     # controlplane(테인트 있음), node01
   ```

   - 사전 준비 → 정답 → 확인 명령 순서로 실제로 실행해서 기대한 결과가 나오는지 본다.
   - YAML 블록: `python3 scripts/cka.py yaml docs/days/day-NNN.md <임시폴더>` 로 추출한 뒤, 완전한 매니페스트는 `kubectl apply --dry-run=server -f` 로 검사한다.
   - 샌드박스는 etcd + kube-apiserver + controller-manager + scheduler 와 가짜 kubelet(`scripts/fake_kubelet.py`)이다. 노드에 배정된 Pod 는 전부 Running/Ready 로 표시되므로 이미지 오류 같은 장애는 재현되지 않는다. `logs`/`exec`/`crictl`/`systemctl`/`journalctl`/`kubeadm`/`etcdctl snapshot` 은 검증할 수 없으니 공식 문서로 확인한다.
   - 다른 Day 의 리소스가 남아 헷갈리면 `scripts/sandbox.sh reset`.
2. **형식 검증 + manifest 갱신**: `python3 scripts/cka.py build` (`docs/days/manifest.json` 은 직접 고치지 않는다)
3. **링크 검사**: `python3 scripts/cka.py check-links docs/days/day-NNN.md`
4. (사이트 코드를 바꿨다면) `python3 -m http.server -d docs` 로 띄워 Playwright 로 콘솔 에러와 화면을 확인한다.

## 6. 게시

- 커밋 메시지: `Add CKA Day N: <제목>`
- 브랜치·main 반영 방법은 `CLAUDE.md` 의 "게시 규칙"을 따른다.
- GitHub Pages 반영까지 보통 1~2분 걸린다. 페이지 주소: `https://parrotjeong.github.io/Kubernetes/day.html?d=N`

## 7. 사용자에게 보고 (한국어, 짧게)

- Day 번호·제목, 문제 목록(도메인·난이도), 권장 시간, 페이지 링크
- 무엇을 검증했는지 한 줄 (예: "Q1~Q4 정답을 로컬 API 서버에서 실행해 확인, Q5 crictl 은 공식 문서로 확인")
- 오늘 읽을 강의 2~3개
