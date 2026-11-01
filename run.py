"""One-command local setup and launch: python run.py."""
import importlib.util, os, shutil, subprocess, sys, venv
from pathlib import Path
from launch_support import dependencies_changed, remember_dependencies, frontend_is_stale

ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
python=ROOT/'.venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
if Path(sys.prefix).resolve()!= (ROOT/'.venv').resolve():
    if not python.exists():
        print('Creating isolated Python environment...',flush=True)
        venv.create(ROOT/'.venv',with_pip=True)
    raise SystemExit(subprocess.call([str(python),str(ROOT/'run.py'),*sys.argv[1:]]))
python_stamp=ROOT/'.venv'/'.bon-voyage-requirements'
if dependencies_changed(ROOT/'requirements.txt',python_stamp) or any(importlib.util.find_spec(package) is None for package in ('fastapi','uvicorn','psycopg','searoute')):
    subprocess.run([sys.executable,'-m','pip','install','-r','requirements.txt'],check=True)
    remember_dependencies(ROOT/'requirements.txt',python_stamp)
npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
if not npm:
    raise SystemExit('Install Node.js 20.19+ or 22.12+ (including npm), then run this command again.')
node_stamp=ROOT/'node_modules'/'.bon-voyage-package-lock'
dependencies_updated=dependencies_changed(ROOT/'package-lock.json',node_stamp)
if not (ROOT/'node_modules').exists() or dependencies_updated:
    subprocess.run([npm,'ci'],check=True)
    remember_dependencies(ROOT/'package-lock.json',node_stamp)
if dependencies_updated or frontend_is_stale(ROOT):
    subprocess.run([npm,'run','build'],check=True)
port=int(os.environ.get('PORT','8000'))
print(f'\nBon Voyage is ready at http://localhost:{port}\nPress Ctrl+C to stop.\n',flush=True)
import uvicorn
uvicorn.run('backend.main:app',host='127.0.0.1',port=port)


