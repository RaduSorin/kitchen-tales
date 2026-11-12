#!/usr/bin/env python3
"""Fast checks for the iOS sources that run on Linux, without Xcode.

Nobody on the project has a Mac, so the macOS CI job is the first compiler that ever sees the
Swift code, and a mistake costs a 6 to 15 minute run. This script catches, in a second, the
mistakes that made those runs fail most often:

  1. two non-private top-level types with the same name in one target
     ("invalid redeclaration" / "ambiguous for type lookup")
  2. two .swift files with the same name in one target ("filename used twice")
  3. a file in an app extension that uses a type defined only in files the extension does not
     compile ("cannot find 'X' in scope"), or that calls UIApplication.shared

Targets and their sources are read from project.yml, so the check follows the real target
membership. Any error exits with status 1. Each check was tried on the commits that broke CI and
on main, and flags the former without false alarms on the latter.

What it cannot catch (no Swift compiler on Linux): Swift 6 concurrency errors, expressions too
complex for the type checker, wrong types. For those, see the checklist in ios/README.md.

Usage: python3 ios/scripts/precheck.py   (from anywhere; needs PyYAML)
"""

from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

IOS = Path(__file__).resolve().parent.parent

TYPE_DECL = re.compile(
    r"^(?P<mods>(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|internal|private|fileprivate|final|open|"
    r"nonisolated|indirect)\s+)*)(?:struct|class|enum|protocol|actor|typealias)\s+(?P<name>[A-Z]\w*)"
)
IDENT = re.compile(r"\b[A-Z][A-Za-z0-9_]*\b")


def strip_comments_and_strings(text: str) -> str:
    """Blank out comments and string literals, keeping line breaks so line numbers stay right."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("\n" * text.count("\n", i, j))
            i = j
        elif text.startswith('"""', i):
            j = text.find('"""', i + 3)
            j = n if j < 0 else j + 3
            out.append('""' + "\n" * text.count("\n", i, j))
            i = j
        elif c == '"':
            j = i + 1
            depth = 0  # inside \( ... ) interpolation
            while j < n:
                if text[j] == "\\" and j + 1 < n and text[j + 1] == "(":
                    depth += 1
                    j += 2
                    continue
                if depth and text[j] == ")":
                    depth -= 1
                elif not depth and text[j] == "\\":
                    j += 2
                    continue
                elif not depth and text[j] in '"\n':
                    break
                j += 1
            out.append('""')
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def target_files(spec: dict) -> dict[str, list[Path]]:
    """Swift files compiled by each target, following sources, excludes and single-file entries."""
    result: dict[str, list[Path]] = {}
    for name, target in (spec.get("targets") or {}).items():
        files: list[Path] = []
        for src in target.get("sources") or []:
            entry = {"path": src} if isinstance(src, str) else src
            if entry.get("buildPhase") not in (None, "sources"):
                continue
            path = IOS / entry["path"]
            excludes = entry.get("excludes") or []
            if path.is_file():
                candidates = [path]
            else:
                candidates = sorted(path.rglob("*.swift"))
            for f in candidates:
                if f.suffix != ".swift":
                    continue
                rel = f.relative_to(path).as_posix() if path.is_dir() else f.name
                if any(Path(rel).match(x) or rel == x or rel.startswith(x.rstrip("/") + "/") for x in excludes):
                    continue
                files.append(f)
        result[name] = files
    return result


def top_level_types(code: str) -> list[tuple[str, int, bool]]:
    """(name, line, is_private) for every type declared at the top level of a file."""
    found = []
    for lineno, line in enumerate(code.splitlines(), 1):
        if line[:1].isspace():
            continue
        m = TYPE_DECL.match(line)
        if m:
            found.append((m["name"], lineno, bool(re.search(r"\b(private|fileprivate)\b", m["mods"]))))
    return found


def main() -> int:
    spec = yaml.safe_load((IOS / "project.yml").read_text())
    targets = target_files(spec)
    errors: list[str] = []

    def rel(p: Path) -> str:
        return os.path.relpath(p, IOS.parent)

    code_of: dict[Path, str] = {}
    for files in targets.values():
        for f in files:
            if f not in code_of:
                code_of[f] = strip_comments_and_strings(f.read_text(encoding="utf-8"))

    types_in: dict[Path, list[tuple[str, int, bool]]] = {f: top_level_types(c) for f, c in code_of.items()}
    defined_anywhere: dict[str, list[Path]] = defaultdict(list)
    for f, decls in types_in.items():
        for name, _, private in decls:
            if not private:
                defined_anywhere[name].append(f)

    for target, files in targets.items():
        spec_t = spec["targets"][target]
        # A test target sees its host app's types through @testable import.
        deps = [d["target"] for d in spec_t.get("dependencies") or [] if "target" in d]
        visible = set(files)
        if spec_t.get("type", "").startswith("bundle."):
            for d in deps:
                visible |= set(targets.get(d, []))

        # 1. duplicate type names
        seen: dict[str, tuple[Path, int]] = {}
        for f in files:
            for name, line, private in types_in[f]:
                if private:
                    continue
                if name in seen and seen[name][0] != f:
                    first, first_line = seen[name]
                    errors.append(
                        f"[{target}] type '{name}' is declared twice: {rel(first)}:{first_line} and {rel(f)}:{line}. Rename one."
                    )
                else:
                    seen[name] = (f, line)

        # 2. duplicate file names
        by_name: dict[str, list[Path]] = defaultdict(list)
        for f in files:
            by_name[f.name].append(f)
        for fname, paths in by_name.items():
            if len(paths) > 1:
                errors.append(f"[{target}] two files are named {fname}: {', '.join(rel(p) for p in paths)}. Rename one.")

        # 3. app extensions: types from files the extension does not compile
        if spec_t.get("type") == "app-extension":
            local = {n for f in visible for n, _, _ in types_in[f]}
            for f in files:
                code = code_of[f]
                for lineno, line in enumerate(code.splitlines(), 1):
                    if "UIApplication.shared" in line:
                        errors.append(f"[{target}] {rel(f)}:{lineno} uses UIApplication.shared, which app extensions cannot use.")
                    for ident in set(IDENT.findall(line)):
                        if ident in local or ident not in defined_anywhere:
                            continue
                        where = ", ".join(sorted({rel(p) for p in defined_anywhere[ident]}))
                        errors.append(
                            f"[{target}] {rel(f)}:{lineno} uses '{ident}', defined in {where}, which this target does not compile. "
                            f"Add that file to the target in project.yml, or keep this file out of it."
                        )

    for e in errors:
        print(f"error: {e}")
    n_files = len(code_of)
    if errors:
        print(f"iOS precheck: {len(errors)} error(s) in {n_files} Swift files.")
        return 1
    print(f"iOS precheck: OK ({n_files} Swift files, {len(targets)} targets).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
