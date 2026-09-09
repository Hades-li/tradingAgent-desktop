"""PyInstaller entry point for the desktop sidecar.

Kept as a one-line shim so the frozen binary's entry point is a real script
(PyInstaller cannot freeze ``python -m package.module`` directly) and so the
analysis graph starts at ``tradingagents.ipc_main`` rather than ``cli.main`` —
that is what keeps rich / typer / questionary out of the bundle.
"""

import sys

from tradingagents.ipc_main import main

if __name__ == "__main__":
    sys.exit(main())
