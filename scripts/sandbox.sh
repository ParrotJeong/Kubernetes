#!/usr/bin/env bash
# CKA 문제 정답 검증용 로컬 컨트롤 플레인.
#
# etcd + kube-apiserver + kube-controller-manager + kube-scheduler 를 띄우고,
# 진짜 kubelet 대신 scripts/fake_kubelet.py 가 노드에 배정된 Pod 를 Running/Ready 로 표시한다.
# 컨테이너가 실제로 실행되지는 않지만 kubectl 명령/플래그, YAML 스키마, RBAC(auth can-i),
# 스케줄링 결과, rollout, Service 엔드포인트, PV/PVC 바인딩, CSR 승인/서명 같은
# 대부분의 정답은 여기서 검증할 수 있다. (logs/exec, crictl, systemctl 은 검증 불가)
#
# 사용법:
#   scripts/sandbox.sh up       # 바이너리 다운로드(최초 1회) → 기동 → 가짜 노드 2개 등록
#   eval "$(scripts/sandbox.sh env)"   # KUBECONFIG / PATH 설정
#   scripts/sandbox.sh reset    # etcd 데이터를 지우고 깨끗하게 재기동
#   scripts/sandbox.sh down     # 종료
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_VERSION="${K8S_VERSION:-v1.37.1}"
ETCD_VERSION="${ETCD_VERSION:-v3.6.6}"
BASE="${CKA_SANDBOX_HOME:-$HOME/.cache/cka-sandbox}"
BIN="$BASE/bin-$K8S_VERSION"
RUN="$BASE/run"
PKI="$RUN/pki"
LOG="$RUN/logs"
ADMIN_KUBECONFIG="$RUN/admin.kubeconfig"

log() { printf '[sandbox] %s\n' "$*" >&2; }
kc() { KUBECONFIG="$ADMIN_KUBECONFIG" "$BIN/kubectl" "$@"; }

fetch() { # url dest
  [ -s "$2" ] && return 0
  curl -fsSL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}

download() {
  mkdir -p "$BIN"
  local b
  for b in kube-apiserver kube-controller-manager kube-scheduler kubectl; do
    fetch "https://dl.k8s.io/release/$K8S_VERSION/bin/linux/amd64/$b" "$BIN/$b" &
  done
  fetch "https://storage.googleapis.com/etcd/$ETCD_VERSION/etcd-$ETCD_VERSION-linux-amd64.tar.gz" \
    "$BASE/etcd-$ETCD_VERSION.tar.gz" &
  wait
  for b in kube-apiserver kube-controller-manager kube-scheduler kubectl; do
    [ -s "$BIN/$b" ] || { log "다운로드 실패: $b"; exit 1; }
    if [ ! -e "$BIN/$b.verified" ]; then
      echo "$(curl -fsSL "https://dl.k8s.io/release/$K8S_VERSION/bin/linux/amd64/$b.sha256")  $BIN/$b" \
        | sha256sum -c --quiet - && touch "$BIN/$b.verified"
    fi
  done
  if [ ! -x "$BIN/etcd" ]; then
    tar -xzf "$BASE/etcd-$ETCD_VERSION.tar.gz" -C "$BIN" --strip-components=1 \
      "etcd-$ETCD_VERSION-linux-amd64/etcd" \
      "etcd-$ETCD_VERSION-linux-amd64/etcdctl" \
      "etcd-$ETCD_VERSION-linux-amd64/etcdutl"
  fi
  chmod +x "$BIN"/kube-* "$BIN"/kubectl "$BIN"/etcd*
}

gen_pki() {
  [ -s "$PKI/ca.crt" ] && return 0
  mkdir -p "$PKI"
  (
    cd "$PKI"
    openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 \
      -subj "/CN=cka-sandbox-ca" 2>/dev/null
    printf '%s\n' \
      "subjectAltName=DNS:kubernetes,DNS:kubernetes.default,DNS:kubernetes.default.svc,DNS:kubernetes.default.svc.cluster.local,DNS:localhost,IP:127.0.0.1,IP:10.96.0.1" \
      "extendedKeyUsage=serverAuth" >apiserver.ext
    openssl req -newkey rsa:2048 -nodes -keyout apiserver.key -out apiserver.csr \
      -subj "/CN=kube-apiserver" 2>/dev/null
    openssl x509 -req -in apiserver.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
      -out apiserver.crt -days 3650 -extfile apiserver.ext 2>/dev/null
    echo "extendedKeyUsage=clientAuth" >client.ext
    client() { # file CN [O]
      openssl req -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.csr" \
        -subj "/CN=$2${3:+/O=$3}" 2>/dev/null
      openssl x509 -req -in "$1.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
        -out "$1.crt" -days 3650 -extfile client.ext 2>/dev/null
    }
    client admin kubernetes-admin system:masters
    client controller-manager system:kube-controller-manager
    client scheduler system:kube-scheduler
    openssl genrsa -out sa.key 2048 2>/dev/null
    openssl rsa -in sa.key -pubout -out sa.pub 2>/dev/null
  )
  local who
  for who in admin controller-manager scheduler; do
    local f="$RUN/$who.kubeconfig"
    KUBECONFIG="$f" "$BIN/kubectl" config set-cluster sandbox --server=https://127.0.0.1:6443 \
      --certificate-authority="$PKI/ca.crt" --embed-certs >/dev/null
    KUBECONFIG="$f" "$BIN/kubectl" config set-credentials "$who" \
      --client-certificate="$PKI/$who.crt" --client-key="$PKI/$who.key" --embed-certs >/dev/null
    KUBECONFIG="$f" "$BIN/kubectl" config set-context sandbox --cluster=sandbox --user="$who" >/dev/null
    KUBECONFIG="$f" "$BIN/kubectl" config use-context sandbox >/dev/null
  done
}

wait_for() { # name command...
  local name="$1"; shift
  local i
  for i in $(seq 1 60); do
    if timeout 5 "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  log "$name 기동 실패. 로그: $LOG/$name.log"
  tail -20 "$LOG/$name.log" >&2 || true
  exit 1
}

bg() { # name command...
  local name="$1"; shift
  nohup "$@" >"$LOG/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
}

running() { [ -s "$RUN/kube-apiserver.pid" ] && kill -0 "$(cat "$RUN/kube-apiserver.pid")" 2>/dev/null; }

add_node() { # name [control-plane]
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  kc apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Node
metadata:
  name: $1
  labels:
    kubernetes.io/hostname: $1
    kubernetes.io/os: linux
    kubernetes.io/arch: amd64
EOF
  kc patch node "$1" --subresource=status --type=merge -p "{\"status\":{
    \"capacity\":{\"cpu\":\"4\",\"memory\":\"8Gi\",\"pods\":\"110\"},
    \"allocatable\":{\"cpu\":\"4\",\"memory\":\"8Gi\",\"pods\":\"110\"},
    \"conditions\":[{\"type\":\"Ready\",\"status\":\"True\",\"reason\":\"KubeletReady\",
      \"message\":\"cka sandbox fake node\",\"lastHeartbeatTime\":\"$now\",\"lastTransitionTime\":\"$now\"}]}}" >/dev/null
  # TaintNodesByCondition 이 붙인 not-ready 테인트 제거 (node lifecycle 컨트롤러를 끄고 있으므로 직접 정리)
  kc taint node "$1" node.kubernetes.io/not-ready:NoSchedule- >/dev/null 2>&1 || true
  if [ "${2:-}" = "control-plane" ]; then
    kc label node "$1" node-role.kubernetes.io/control-plane= --overwrite >/dev/null
    kc taint node "$1" node-role.kubernetes.io/control-plane:NoSchedule --overwrite >/dev/null
  fi
}

up() {
  if running; then log "이미 실행 중"; return 0; fi
  download
  mkdir -p "$RUN" "$LOG"
  gen_pki

  bg etcd "$BIN/etcd" --name sandbox --data-dir "$RUN/etcd-data" \
    --listen-client-urls http://127.0.0.1:2379 --advertise-client-urls http://127.0.0.1:2379 \
    --listen-peer-urls http://127.0.0.1:2380 --initial-advertise-peer-urls http://127.0.0.1:2380 \
    --initial-cluster sandbox=http://127.0.0.1:2380
  wait_for etcd "$BIN/etcdctl" --endpoints=http://127.0.0.1:2379 endpoint health

  bg kube-apiserver "$BIN/kube-apiserver" \
    --etcd-servers=http://127.0.0.1:2379 \
    --bind-address=127.0.0.1 --advertise-address=127.0.0.1 --secure-port=6443 \
    --tls-cert-file="$PKI/apiserver.crt" --tls-private-key-file="$PKI/apiserver.key" \
    --client-ca-file="$PKI/ca.crt" \
    --service-account-issuer=https://kubernetes.default.svc.cluster.local \
    --service-account-key-file="$PKI/sa.pub" --service-account-signing-key-file="$PKI/sa.key" \
    --service-cluster-ip-range=10.96.0.0/12 \
    --authorization-mode=Node,RBAC --allow-privileged=true \
    --endpoint-reconciler-type=none
  wait_for kube-apiserver "$BIN/kubectl" --kubeconfig "$ADMIN_KUBECONFIG" get --raw=/readyz

  bg kube-controller-manager "$BIN/kube-controller-manager" \
    --kubeconfig="$RUN/controller-manager.kubeconfig" \
    --authentication-kubeconfig="$RUN/controller-manager.kubeconfig" \
    --authorization-kubeconfig="$RUN/controller-manager.kubeconfig" \
    --bind-address=127.0.0.1 --leader-elect=false \
    --use-service-account-credentials=true \
    --service-account-private-key-file="$PKI/sa.key" --root-ca-file="$PKI/ca.crt" \
    --cluster-signing-cert-file="$PKI/ca.crt" --cluster-signing-key-file="$PKI/ca.key" \
    --controllers='*,-node-lifecycle-controller'
  bg kube-scheduler "$BIN/kube-scheduler" \
    --kubeconfig="$RUN/scheduler.kubeconfig" \
    --authentication-kubeconfig="$RUN/scheduler.kubeconfig" \
    --authorization-kubeconfig="$RUN/scheduler.kubeconfig" \
    --bind-address=127.0.0.1 --leader-elect=false
  # default ServiceAccount 가 생기면 컨트롤러 매니저가 정상 동작 중인 것
  wait_for kube-controller-manager "$BIN/kubectl" --kubeconfig "$ADMIN_KUBECONFIG" -n default get serviceaccount default

  add_node controlplane control-plane
  add_node node01
  bg fake-kubelet env KUBECONFIG="$ADMIN_KUBECONFIG" PATH="$BIN:$PATH" python3 "$SCRIPT_DIR/fake_kubelet.py"
  log "준비 완료 (Kubernetes $K8S_VERSION, 노드: controlplane, node01)"
  log "사용: eval \"\$($0 env)\""
}

down() {
  local name pid i
  for name in fake-kubelet kube-scheduler kube-controller-manager kube-apiserver etcd; do
    [ -s "$RUN/$name.pid" ] || continue
    pid="$(cat "$RUN/$name.pid")"
    kill "$pid" 2>/dev/null || true
    # 포트와 데이터 디렉터리를 놓을 때까지 기다린다 (바로 재기동하면 충돌)
    for i in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$RUN/$name.pid"
  done
  log "종료"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  reset) down; rm -rf "$RUN/etcd-data"; up ;;
  env)
    echo "export KUBECONFIG='$ADMIN_KUBECONFIG'"
    echo "export PATH='$BIN':\"\$PATH\""
    ;;
  status) if running; then kc get nodes; else log "실행 중 아님"; exit 1; fi ;;
  *) echo "usage: $0 {up|down|reset|env|status}" >&2; exit 2 ;;
esac
