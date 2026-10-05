#!/usr/bin/env python3
from pathlib import Path
import re, sys

DANGEROUS = re.compile(
    r"\b(import|export|const|let|function|await|fetch|Promise|process\.env|hasPermission|notFound|redirect|metadata|"
    r"buildPublicMetadata|ReconciliationWarning|useState|useEffect|useMemo|useRef|set[A-Z]\w*|"
    r"Action\b|action=|onSubmit=|onClick=|DATABASE|db\.|wallet|permission|role\b|statusId|visaTypeId)\b"
)
VISUAL = re.compile(
    r"className=|\b(text|bg|border|gap|p[trblxyse]?|m[trblxyse]?|space-[xy]|rounded|shadow|tracking|leading|"
    r"items|justify|grid|flex|overflow|min-w|min-h|max-w|max-h|w-|h-|inset|top-|bottom-|start-|end-|"
    r"focus|hover|sm:|md:|lg:|xl:|2xl:)\S*|aria-|data-|tabIndex=|role=|style="
)

def choose_approved(ours, theirs):
    joined = "".join(ours + theirs)
    if DANGEROUS.search(joined):
        return False
    meaningful = [ln.strip() for ln in ours + theirs if ln.strip()]
    if not meaningful:
        return False
    # Class/layout/accessibility-only edits are presentation. JSX wrapper-only
    # changes are accepted only when a visual token is also present in the block.
    if VISUAL.search(joined):
        for line in meaningful:
            if line.startswith(("//", "/*", "*", "*/", "<", "</", ">", "{/*")):
                continue
            if VISUAL.search(line):
                continue
            if line in {"(", ")", "{", "}", "};", ");", ")}", ")};"}:
                continue
            return False
        return True
    return False

def resolve(path: Path):
    lines = path.read_text().splitlines(keepends=True)
    out=[]; i=0; approved_count=0; current_count=0
    while i < len(lines):
        if not lines[i].startswith("<<<<<<< "):
            out.append(lines[i]); i += 1; continue
        i += 1
        ours=[]
        while i < len(lines) and not lines[i].startswith(("||||||| ", "=======")):
            ours.append(lines[i]); i += 1
        if i < len(lines) and lines[i].startswith("||||||| "):
            i += 1
            while i < len(lines) and not lines[i].startswith("======="):
                i += 1
        if i >= len(lines) or not lines[i].startswith("======="):
            raise RuntimeError(f"Malformed conflict in {path}")
        i += 1
        theirs=[]
        while i < len(lines) and not lines[i].startswith(">>>>>>> "):
            theirs.append(lines[i]); i += 1
        if i >= len(lines):
            raise RuntimeError(f"Malformed conflict in {path}")
        i += 1
        if choose_approved(ours, theirs):
            out.extend(theirs); approved_count += 1
        else:
            out.extend(ours); current_count += 1
    path.write_text("".join(out))
    print(f"{path}: approved_visual={approved_count} preserved_current={current_count}")

for name in sys.argv[1:]:
    resolve(Path(name))
