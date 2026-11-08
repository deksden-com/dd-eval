import json
import os
from pathlib import Path
import sys

roots = [os.path.abspath(value) for value in sys.argv[1:]]
excluded = set()
pid = os.getpid()
while pid and pid not in excluded:
    excluded.add(pid)
    try:
        pid = int(Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[1])
    except (OSError, ValueError):
        break
matches = []
for process in Path('/proc').iterdir():
    if not process.name.isdigit() or int(process.name) in excluded:
        continue
    found = set()
    try:
        argv = (process / 'cmdline').read_bytes().decode(errors='replace')
        for root in roots:
            if root in argv:
                found.add((root, 'argv'))
    except OSError:
        pass
    for kind, target in [('cwd', process / 'cwd'), *[('fd', file) for file in (process / 'fd').glob('*')]]:
        try:
            value = os.readlink(target)
            for root in roots:
                if value == root or value.startswith(root + '/'):
                    found.add((root, kind))
        except OSError:
            pass
    try:
        maps = (process / 'maps').read_text()
        for root in roots:
            if root in maps:
                found.add((root, 'maps'))
    except OSError:
        pass
    if found:
        matches.append({'pid': int(process.name), 'matches': [{'root': root, 'kind': kind} for root, kind in sorted(found)]})
print(json.dumps({'roots': [{'root': root, 'exists': os.path.exists(root), 'canonical': os.path.realpath(root) == root} for root in roots],
                  'excluded_audit_ancestors': sorted(excluded), 'consumers': matches}, indent=2))
