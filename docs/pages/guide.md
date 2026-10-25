## 이 사이트 사용법

1. 아침에 Claude 에게 **“오늘 CKA 문제 만들어줘”** 라고 요청합니다. 로드맵의 다음 Day 가 **📖 학습 노트**와 **✍️ 문제** 두 탭으로 이 사이트에 올라옵니다.
2. 먼저 학습 노트를 읽습니다. 그날 범위의 KodeKloud 강의 노트와 Kubernetes 공식 문서를 한국어로 정리했고, 강의가 예전 버전 기준인 곳은 **⚠️ 최신 버전**으로 바로잡아 두었습니다. 다 읽으면 **다 읽었어요**를 체크하세요.
3. 문제는 **사전 준비 → 문제 → 힌트 → 정답** 순서입니다. 사전 준비 명령으로 실습 상태를 만든 뒤, 실제 시험처럼 영어로 된 문제를 읽고 풀어 보세요.
4. 다 풀면 **완료**를 체크하고, 다시 풀어야 할 문제는 **☆ 다시 보기**로 표시합니다. 대시보드에 모아서 보여줍니다.
5. 상단 타이머는 문제별 권장 시간의 합계입니다. 실제 시험은 2시간에 15\~20문제, 문제당 6\~8분 정도입니다.
6. 헷갈린 문제가 있으면 다음 날 요청할 때 함께 알려주세요. 예: “오늘 문제 만들어줘. 어제 Q4 NetworkPolicy가 어려웠어.” → 복습 문제에 반영합니다.

## 실습 환경

| 환경 | 추천 용도 | 비고 |
| --- | --- | --- |
| [Killercoda CKA Playground](https://killercoda.com/playgrounds/scenario/cka) | **기본 실습 환경** | 무료. kubeadm 으로 만든 `controlplane` + `node01` 클러스터. 세션 시간이 정해져 있으니 Day 하나를 한 세션에 끝내세요. |
| kind / minikube (내 PC) | 일반 리소스 문제 | Docker 만 있으면 됩니다. kubeadm 업그레이드·etcd 백업·kubelet 장애 문제는 실습할 수 없습니다. |
| KodeKloud 강의 랩 | 강의와 같은 실습 | 강의 구독 시 사용 가능. 강의 노트와 같은 순서입니다. |
| [killer.sh](https://killer.sh/) | 시험 1\~2주 전 | 시험 등록 시 2회 제공(각 36시간). 실제 시험보다 어렵게 나옵니다. |

문제는 Killercoda CKA Playground 기준으로 작성합니다. 다른 환경에서는 노드 이름(`controlplane`, `node01`)만 바꿔서 풀면 됩니다.

## 시험장에서 바로 쓰는 kubectl 습관

시험 환경에는 `k` 별칭과 Bash 자동완성이 이미 설정되어 있습니다.

```bash
export do="--dry-run=client -o yaml"    # k run web --image=nginx $do > web.yaml
export now="--force --grace-period=0"   # k delete pod web $now

k explain pod.spec.containers.resources  # 필드 이름이 기억나지 않을 때
k get pod -A -o wide --show-labels
k config current-context
```

- **호스트 확인**: 문제마다 지정된 호스트로 `ssh <노드>` 접속하고, 끝나면 `exit` 로 돌아옵니다. 루트 권한은 `sudo -i`.
- **네임스페이스**: `-n <ns>` 를 빠뜨리는 실수가 가장 흔합니다. 문제의 네임스페이스를 먼저 확인하세요.
- **파일로 저장하는 문제**: 경로와 출력 형식을 문제 그대로 지켜야 채점됩니다.
- **static pod 수정**: `/etc/kubernetes/manifests/` 의 YAML 을 고치면 kubelet 이 알아서 다시 띄웁니다. 반영 여부는 `crictl ps` 로 확인합니다.
- **YAML 편집**: `~/.vimrc` 에 `set expandtab tabstop=2 shiftwidth=2` 를 넣어 두면 들여쓰기 실수가 줄어듭니다.
- **시간 관리**: 막히는 문제는 표시해 두고 넘어가세요. 66% 이상이면 합격입니다.

## 하루 공부 루틴 (약 1시간)

1. **학습 노트 읽기 15\~20분**: 사이트의 📖 학습 노트를 읽고, 더 궁금한 부분은 출처에 있는 강의 노트·공식 문서 원문을 봅니다.
2. **문제 풀기 30\~40분**: 타이머를 켜고 정답을 보지 않고 풀어 봅니다.
3. **공식 문서로 복습 10분**: 시험 중에는 kubernetes.io/docs 같은 공식 문서만 볼 수 있습니다. 정답 해설에 걸린 공식 문서 링크를 따라가며 YAML 예제가 문서 어디에 있는지 익혀 두세요.
