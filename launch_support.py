"""Small, testable helpers for the local launcher."""
from pathlib import Path
import hashlib


def dependency_digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dependencies_changed(manifest, stamp):
    return not stamp.exists() or stamp.read_text().strip()!=dependency_digest(manifest)


def remember_dependencies(manifest, stamp):
    stamp.parent.mkdir(parents=True,exist_ok=True)
    stamp.write_text(dependency_digest(manifest))


def frontend_is_stale(root):
    index=root/'dist'/'index.html'
    if not index.exists(): return True
    built=index.stat().st_mtime_ns
    sources=[root/'index.html',root/'package.json',root/'package-lock.json',root/'vite.config.js']
    for directory in ('src','public'):
        sources.append(root/directory)
        sources.extend((root/directory).rglob('*'))
    return any(path.exists() and path.stat().st_mtime_ns>built for path in sources)
