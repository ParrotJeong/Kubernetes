# Kubernetes — CKA Daily

CKA(Certified Kubernetes Administrator) 시험을 준비하며 매일 실기형 문제를 푸는 사이트입니다.
공식 커리큘럼(Kubernetes v1.37)과 [KodeKloud CKA 강의 노트](https://notes.kodekloud.com/docs/Certified-Kubernetes-Administrator-CKA)를 바탕으로
Claude 가 매일 문제를 만들어 올립니다.

**사이트**: https://parrotjeong.github.io/Kubernetes/

## 사용법

1. 아침에 Claude Code 에서 **“오늘 CKA 문제 만들어줘”** 라고 요청합니다.
2. 로드맵의 다음 Day 문제(5문제, 30분 안팎)가 만들어져 사이트에 올라옵니다.
3. [Killercoda CKA Playground](https://killercoda.com/playgrounds/scenario/cka)에서 풀고, 사이트에서 정답·해설을 확인합니다.
4. 어려웠던 문제를 다음 요청 때 말해 주면 복습 문제로 다시 나옵니다.

## 구성

- **대시보드**: 오늘의 문제, 시험 D-day, 도메인별 진도, 다시 볼 문제
- **로드맵**: 33일 계획 (Core Concepts → Scheduling → … → Troubleshooting → 모의고사 3회)
- **시험 가이드**: 시험 형식, 시험 환경, 허용 문서, 도메인별 비중과 역량, kubectl 습관

진도 체크와 시험일은 브라우저에만 저장됩니다.

## 로컬에서 보기

```bash
python3 -m http.server -d docs 8000   # http://localhost:8000
```

## 정답 검증용 샌드박스

문제를 만들 때 정답 명령과 YAML 을 실제 API 서버에서 검증합니다.

```bash
scripts/sandbox.sh up                  # etcd + kube-apiserver + controller-manager + scheduler (+ 가짜 kubelet)
eval "$(scripts/sandbox.sh env)"
kubectl get nodes                      # controlplane, node01
scripts/sandbox.sh down
```
