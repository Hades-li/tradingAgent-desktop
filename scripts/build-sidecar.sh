#!/usr/bin/env bash
# Build the Python sidecar that the desktop app spawns.
#
# Order matters: PyInstaller must produce the bundle and it must be copied into
# desktop/build/sidecar BEFORE electron-builder runs, so the whole .app is
# signed as one unit. Signing the sidecar afterwards invalidates the outer
# signature and arm64 refuses to launch the result.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

python="${TRADINGAGENTS_PYTHON:-$here/.venv/bin/python}"
outdir="$here/desktop/build"
work="$here/desktop/build/.pyinstaller"

if [ ! -x "$python" ]; then
  echo "找不到 Python 解释器：$python" >&2
  echo "请先创建虚拟环境：python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'" >&2
  exit 1
fi

"$python" -m pip install --quiet --upgrade pyinstaller

# Keep PyInstaller's binary-dependency cache inside the build directory instead
# of ~/Library/Application Support, so a build is self-contained and works in
# sandboxed/CI environments where the user config dir is not writable.
export PYINSTALLER_CONFIG_DIR="${PYINSTALLER_CONFIG_DIR:-$outdir/.pyinstaller-cache}"

rm -rf "$outdir/sidecar" "$work"
mkdir -p "$outdir"

# --onedir, never --onefile: onefile re-extracts pandas/langchain on every
# launch, which costs seconds per run.
#
# --collect-all for the langchain family: those packages resolve plenty of
# modules dynamically and through entry points, and PyInstaller's static
# analysis misses them. A missing module here is the single most common
# packaging failure.
#
# cli/ is deliberately not an entry point, so rich / pygments / typer /
# questionary fall out of the dependency graph on their own.
"$python" -m PyInstaller \
  --noconfirm \
  --onedir \
  --name tradingagents-sidecar \
  --distpath "$outdir" \
  --workpath "$work" \
  --specpath "$work" \
  --collect-all langchain \
  --collect-all langchain_core \
  --collect-all langchain_community \
  --collect-all langchain_openai \
  --collect-all langchain_anthropic \
  --collect-all langchain_google_genai \
  --collect-all langgraph \
  --collect-all langgraph_checkpoint \
  --collect-all langgraph_checkpoint_sqlite \
  --collect-all tiktoken \
  --collect-all yfinance \
  --collect-all stockstats \
  --hidden-import tradingagents.ipc_main \
  "$here/scripts/sidecar_entry.py"

mv "$outdir/tradingagents-sidecar" "$outdir/sidecar"

echo "sidecar 已构建：$outdir/sidecar"
echo "接下来：cd desktop && npm run dist:mac"
