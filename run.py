"""One-command local setup and launch: python run.py."""
import importlib.util, os, shutil, subprocess, sys, venv
from pathlib import Path

ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
python=ROOT/'.venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
if Path(sys.prefix).resolve()!= (ROOT/'.venv').resolve():
    if not python.exists():
        print('Creating isolated Python environment...',flush=True)
        venv.create(ROOT/'.venv',with_pip=True)
    raise SystemExit(subprocess.call([str(python),str(ROOT/'run.py'),*sys.argv[1:]]))
if any(importlib.util.find_spec(package) is None for package in ('fastapi','uvicorn','psycopg','searoute')):
    subprocess.run([sys.executable,'-m','pip','install','-r','requirements.txt'],check=True)
npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
if not npm:
    raise SystemExit('Install Node.js 20.19+ or 22.12+ (including npm), then run this command again.')
if not (ROOT/'node_modules').exists():
    subprocess.run([npm,'ci'],check=True)
sources=[ROOT/'index.html',ROOT/'package.json',ROOT/'vite.config.js',*list((ROOT/'src').glob('*')),*list((ROOT/'public').glob('*'))]
index=ROOT/'dist'/'index.html'
if not index.exists() or any(p.stat().st_mtime>index.stat().st_mtime for p in sources):
    subprocess.run([npm,'run','build'],check=True)
print('\nBon Voyage is ready at http://localhost:8000\nPress Ctrl+C to stop.\n',flush=True)
import uvicorn
uvicorn.run('backend.main:app',host='127.0.0.1',port=int(os.environ.get('PORT','8000')))


