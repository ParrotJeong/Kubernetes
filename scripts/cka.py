#!/usr/bin/env python3
"""CKA Daily 도우미 스크립트.

    python3 scripts/cka.py next                 # 다음 Day 번호, 로드맵 항목, 도메인별 출제 현황 출력
    python3 scripts/cka.py build                # docs/days/*.md 형식 검증 후 docs/days/manifest.json 생성
    python3 scripts/cka.py check-links [FILE…]  # 링크 상태 확인 (인자 없으면 로드맵 + 모든 Day 파일)
    python3 scripts/cka.py yaml FILE OUTDIR     # Day 파일의 ```yaml 블록을 OUTDIR 에 파일로 추출(문법 검사 포함)

Day 파일 형식은 .claude/skills/cka-daily/SKILL.md 참고.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DAYS_DIR = DOCS / "days"
PLAN = DOCS / "data" / "plan.json"
CURRICULUM = DOCS / "data" / "curriculum.json"
MANIFEST = DAYS_DIR / "manifest.json"
FEEDBACK = ROOT / "notes" / "feedback.md"

DAY_FILE_RE = re.compile(r"^day-(\d{3})\.md$")
FRONT_MATTER_KEYS = ("day", "date", "title", "focus", "summary")
QUESTION_RE = re.compile(r"^## (Q\d+)\. (.+?)\s*$")
META_RE = re.compile(r"^<!-- domain: ([a-z]+) \| level: ([1-3]) \| minutes: (\d+) -->$")
LINK_RE = re.compile(r"\]\((https?://[^)\s]+)\)")
FENCE_RE = re.compile(r"^[ \t]*```[^\n]*\n.*?^[ \t]*```[ \t]*$", re.S | re.M)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
SINGLE_TILDE_RE = re.compile(r"(?<![\\~])~(?!~)")


def unescaped_tildes(text: str) -> list[str]:
    """코드 밖의 '~' 한 개가 들어간 줄. GFM 에서는 '15~20분, 6~8분' 이 취소선으로 렌더링된다."""
    plain = INLINE_CODE_RE.sub("", FENCE_RE.sub("", text))
    return [line.strip() for line in plain.splitlines() if SINGLE_TILDE_RE.search(line)]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def domain_ids() -> list[str]:
    return [d["id"] for d in load_json(CURRICULUM)["domains"]]


def parse_front_matter(text: str, path: Path) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        raise ValueError(f"{path.name}: 첫 줄이 '---' 인 front matter 가 필요합니다")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError(f"{path.name}: front matter 가 '---' 로 닫히지 않았습니다")
    meta = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise ValueError(f"{path.name}: front matter 줄 형식 오류: {line!r}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        meta[key.strip()] = value
    return meta, text[end + 5 :]


def parse_day(path: Path, domains: list[str]) -> dict:
    """Day 파일 하나를 파싱/검증해서 manifest 항목을 돌려준다. 문제가 있으면 ValueError."""
    errors: list[str] = []
    m = DAY_FILE_RE.match(path.name)
    if not m:
        raise ValueError(f"{path.name}: 파일명은 day-001.md 형식이어야 합니다")
    meta, body = parse_front_matter(path.read_text(encoding="utf-8"), path)

    missing = [k for k in FRONT_MATTER_KEYS if not meta.get(k)]
    if missing:
        errors.append(f"front matter 누락: {', '.join(missing)}")
    if meta.get("day") and int(meta["day"]) != int(m.group(1)):
        errors.append(f"front matter day({meta['day']}) 와 파일명({m.group(1)}) 불일치")
    if meta.get("date"):
        try:
            datetime.strptime(meta["date"], "%Y-%m-%d")
        except ValueError:
            errors.append(f"date 형식은 YYYY-MM-DD: {meta['date']}")

    lines = body.splitlines()
    problems = []
    for i, line in enumerate(lines):
        q = QUESTION_RE.match(line)
        if not q:
            continue
        qid, title = q.groups()
        nxt = next((l.strip() for l in lines[i + 1 :] if l.strip()), "")
        mm = META_RE.match(nxt)
        if not mm:
            errors.append(f"{qid}: 제목 바로 다음 줄에 '<!-- domain: <id> | level: <1-3> | minutes: <n> -->' 가 필요합니다")
            continue
        domain, level, minutes = mm.group(1), int(mm.group(2)), int(mm.group(3))
        if domain not in domains:
            errors.append(f"{qid}: 알 수 없는 domain '{domain}' (허용: {', '.join(domains)})")
        problems.append({"id": qid, "title": title, "domain": domain, "level": level, "minutes": minutes, "_line": i})

    if not problems:
        errors.append("'## Q1. 제목' 형식의 문제가 하나도 없습니다")
    for n, p in enumerate(problems, start=1):
        if p["id"] != f"Q{n}":
            errors.append(f"문제 번호가 순서대로가 아닙니다: {p['id']} (기대값 Q{n})")
    # 각 문제 구간에 정답(details)이 있는지 확인
    bounds = [p["_line"] for p in problems] + [len(lines)]
    for idx, p in enumerate(problems):
        section = "\n".join(lines[bounds[idx] : bounds[idx + 1]])
        if "<summary>정답" not in section:
            errors.append(f"{p['id']}: '<summary>정답 …</summary>' 블록이 없습니다")
        if section.count("<details>") != section.count("</details>"):
            errors.append(f"{p['id']}: <details> 열고 닫힘 개수가 다릅니다")
        p.pop("_line")
    if body.count("```") % 2:
        errors.append("코드 펜스(```) 개수가 홀수입니다")
    for line in unescaped_tildes(body):
        errors.append(f"범위 표기 '~' 는 '\\~' 로 쓰세요 (취소선이 됨): {line[:70]}")

    if errors:
        raise ValueError(f"{path.name}:\n  - " + "\n  - ".join(errors))
    return {
        "day": int(meta["day"]),
        "date": meta["date"],
        "title": meta["title"],
        "focus": meta["focus"],
        "summary": meta["summary"],
        "file": f"days/{path.name}",
        "problems": problems,
    }


def day_files() -> list[Path]:
    return sorted(p for p in DAYS_DIR.glob("day-*.md"))


def cmd_build(_args) -> int:
    domains = domain_ids()
    entries, failed = [], False
    for path in day_files():
        try:
            entries.append(parse_day(path, domains))
        except ValueError as e:
            failed = True
            print(f"[오류] {e}", file=sys.stderr)
    for path in sorted((DOCS / "pages").glob("*.md")):
        for line in unescaped_tildes(path.read_text(encoding="utf-8")):
            failed = True
            print(f"[오류] {path.name}: 범위 표기 '~' 는 '\\~' 로 쓰세요 (취소선이 됨): {line[:70]}", file=sys.stderr)
    if failed:
        return 1
    entries.sort(key=lambda e: e["day"])
    days = [e["day"] for e in entries]
    if days != list(range(1, len(days) + 1)):
        print(f"[오류] Day 번호가 1부터 연속이어야 합니다: {days}", file=sys.stderr)
        return 1
    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "days": entries,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(e["problems"]) for e in entries)
    print(f"manifest.json 생성: Day {len(entries)}개, 문제 {total}개")
    return 0


def cmd_next(_args) -> int:
    plan = load_json(PLAN)
    curriculum = load_json(CURRICULUM)
    domains = domain_ids()
    entries = []
    for path in day_files():
        try:
            entries.append(parse_day(path, domains))
        except ValueError as e:
            print(f"[경고] {e}", file=sys.stderr)
    done = max((e["day"] for e in entries), default=0)
    nxt = done + 1
    base = plan["kodekloud_base"]
    item = next((d for d in plan["days"] if d["day"] == nxt), None)

    print(f"# 다음 Day: {nxt}  (완료된 Day: {done})")
    if item is None:
        print("로드맵 범위를 넘었습니다 → 약점 복습 세트 또는 추가 모의고사를 만드세요.")
    else:
        print(f"제목: {item['title']}")
        print(f"강의 섹션: {item['section']}{'  [모의고사]' if item.get('mock') else ''}")
        print(f"주 도메인: {', '.join(item['domains'])}")
        print("주제:")
        for t in item["topics"]:
            print(f"  - {t}")
        print("KodeKloud 강의 (본문은 URL 뒤에 /page.md 를 붙여 마크다운으로 읽기):")
        for lesson in item["lessons"]:
            print(f"  - {lesson['title']}: {base}{lesson['path']}/page.md")
        if item["docs"]:
            print("공식 문서:")
            for doc in item["docs"]:
                print(f"  - {doc['title']}: {doc['url']}")

    counts = {d: 0 for d in domains}
    for e in entries:
        for p in e["problems"]:
            counts[p["domain"]] += 1
    total = sum(counts.values())
    print("\n# 지금까지 도메인별 출제 수 (시험 비중과 비교해서 복습 문제 도메인을 고르세요)")
    for d in curriculum["domains"]:
        share = counts[d["id"]] / total * 100 if total else 0
        print(f"  - {d['id']:<16} {counts[d['id']]:>3}문제 ({share:4.1f}%)  시험 비중 {d['weight']}%")
    if entries:
        print("\n# 이전 Day (복습 문제 후보)")
        for e in entries[-7:]:
            print(f"  - Day {e['day']}: {e['title']} — " + ", ".join(p["title"] for p in e["problems"]))
    feedback = []
    if FEEDBACK.exists():
        feedback = [l for l in FEEDBACK.read_text(encoding="utf-8").splitlines() if l.startswith("- ")]
    print("\n# 사용자 피드백 (notes/feedback.md, 최근 10개)")
    for line in feedback[-10:] or ["  (없음)"]:
        print(f"  {line}")
    return 0


def collect_links(files: list[Path]) -> list[str]:
    urls: list[str] = []
    if not files:
        plan = load_json(PLAN)
        for d in plan["days"]:
            urls += [plan["kodekloud_base"] + l["path"] for l in d["lessons"]]
            urls += [doc["url"] for doc in d["docs"]]
        cur = load_json(CURRICULUM)
        urls += [s["url"] for s in cur["exam"]["sources"]] + [s["url"] for s in cur["exam"]["allowed_docs"]]
        urls.append(plan["practice"]["url"])
        files = day_files() + sorted((DOCS / "pages").glob("*.md"))
    for f in files:
        urls += LINK_RE.findall(f.read_text(encoding="utf-8"))
    return list(dict.fromkeys(urls))


def http_status(url: str) -> str:
    try:
        out = subprocess.run(
            ["curl", "-sS", "-o", "/dev/null", "-L", "--max-time", "25", "-w", "%{http_code}", url],
            capture_output=True, text=True, timeout=40,
        )
        return out.stdout.strip() or out.stderr.strip()[:80]
    except subprocess.TimeoutExpired:
        return "timeout"


def cmd_check_links(args) -> int:
    urls = collect_links([Path(a) for a in args])
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(http_status, urls))
    bad = [(u, s) for u, s in zip(urls, results) if s != "200"]
    for u, s in bad:
        print(f"[{s}] {u}")
    print(f"링크 {len(urls)}개 확인, 문제 {len(bad)}개")
    return 1 if bad else 0


def cmd_yaml(args) -> int:
    if len(args) != 2:
        print("usage: cka.py yaml FILE OUTDIR", file=sys.stderr)
        return 2
    src, out = Path(args[0]), Path(args[1])
    out.mkdir(parents=True, exist_ok=True)
    text = src.read_text(encoding="utf-8")
    try:
        import yaml  # type: ignore
    except ImportError:
        yaml = None
    question, n, failed = "Q0", 0, False
    in_block, buf = False, []
    for line in text.splitlines():
        q = QUESTION_RE.match(line)
        if q and not in_block:
            question, n = q.group(1), 0
        stripped = line.strip()
        if not in_block and stripped == "```yaml":
            in_block, buf = True, []
            indent = len(line) - len(line.lstrip())
            continue
        if in_block and stripped == "```":
            in_block, n = False, n + 1
            content = "\n".join(l[indent:] if l[:indent].strip() == "" else l for l in buf) + "\n"
            target = out / f"{question.lower()}-{n}.yaml"
            target.write_text(content, encoding="utf-8")
            status = "ok"
            if yaml is not None:
                try:
                    list(yaml.safe_load_all(content))
                except yaml.YAMLError as e:
                    status, failed = f"YAML 오류: {e}", True
            print(f"{target.relative_to(out)}: {status}")
            continue
        if in_block:
            buf.append(line)
    return 1 if failed else 0


COMMANDS = {"next": cmd_next, "build": cmd_build, "check-links": cmd_check_links, "yaml": cmd_yaml}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(2)
    sys.exit(COMMANDS[sys.argv[1]](sys.argv[2:]))
