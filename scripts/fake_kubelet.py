#!/usr/bin/env python3
"""샌드박스용 가짜 kubelet (scripts/sandbox.sh 가 백그라운드로 실행한다).

실제 컨테이너는 띄우지 않고, kubelet 이 API 서버에 보고하는 상태만 흉내 낸다.
  - 노드에 배정된 Pending Pod → Running/Ready 로 표시 (podIP 부여)
    → Deployment 가용 수, rollout status, Service 엔드포인트가 실제처럼 동작한다.
  - 삭제 중(Terminating)인 Pod → 즉시 삭제 확정
    → kubectl delete / replace --force / drain 이 멈추지 않는다.
이미지 이름이 틀려도 Running 으로 표시하므로, 장애 상황 자체를 재현하는 용도로는 쓰지 않는다.
"""
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone


def kubectl(*args, input_text=None):
    return subprocess.run(["kubectl", *args], input=input_text, capture_output=True, text=True)


def fake_ip(prefix: str, key: str) -> str:
    h = hashlib.sha1(key.encode()).digest()
    return f"{prefix}.{h[0] % 250 + 1}.{h[1] % 250 + 2}"


def running_status(pod: dict, now: str) -> dict:
    ns, name = pod["metadata"]["namespace"], pod["metadata"]["name"]
    spec = pod["spec"]

    def cstatus(c, init=False):
        cid = "containerd://" + hashlib.sha256(f"{ns}/{name}/{c['name']}".encode()).hexdigest()
        st = {
            "name": c["name"],
            "image": c.get("image", ""),
            "imageID": "",
            "containerID": cid,
            "restartCount": 0,
        }
        sidecar = init and c.get("restartPolicy") == "Always"
        if init and not sidecar:
            st.update(ready=True, started=False,
                      state={"terminated": {"exitCode": 0, "reason": "Completed",
                                            "startedAt": now, "finishedAt": now, "containerID": cid}})
        else:
            st.update(ready=True, started=True, state={"running": {"startedAt": now}})
        return st

    pod_ip = fake_ip("10.244", f"{ns}/{name}")
    host_ip = fake_ip("192.168", spec["nodeName"])
    cond = lambda t: {"type": t, "status": "True", "lastProbeTime": None, "lastTransitionTime": now}
    return {
        "status": {
            "phase": "Running",
            "hostIP": host_ip,
            "hostIPs": [{"ip": host_ip}],
            "podIP": pod_ip,
            "podIPs": [{"ip": pod_ip}],
            "startTime": now,
            "conditions": [cond("PodReadyToStartContainers"), cond("Initialized"),
                           cond("Ready"), cond("ContainersReady"), cond("PodScheduled")],
            "containerStatuses": [cstatus(c) for c in spec.get("containers", [])],
            "initContainerStatuses": [cstatus(c, init=True) for c in spec.get("initContainers", [])],
        }
    }


def tick():
    out = kubectl("get", "pods", "-A", "-o", "json")
    if out.returncode != 0:
        return
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for pod in json.loads(out.stdout)["items"]:
        meta, spec, status = pod["metadata"], pod["spec"], pod.get("status", {})
        ns, name = meta["namespace"], meta["name"]
        if meta.get("deletionTimestamp"):
            if spec.get("nodeName"):
                kubectl("-n", ns, "delete", "pod", name, "--grace-period=0", "--force", "--wait=false")
            continue
        if spec.get("nodeName") and status.get("phase", "Pending") == "Pending":
            kubectl("-n", ns, "patch", "pod", name, "--subresource=status", "--type=merge",
                    "-p", json.dumps(running_status(pod, now)))


if __name__ == "__main__":
    while True:
        try:
            tick()
        except Exception as e:  # 샌드박스 보조 프로세스이므로 죽지 않고 계속 돈다
            print(f"fake-kubelet: {e}", flush=True)
        time.sleep(1)
