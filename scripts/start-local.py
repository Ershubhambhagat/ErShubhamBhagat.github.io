"""
scripts/start-local.py - local development launcher for this portfolio.

Why this file exists: START_LOCAL.md asks for a double-clickable Windows launcher
that serves the whole project root and opens the site without a terminal command.
A batch file alone cannot reliably probe HTTP readiness, detect a project server
that is already running, or report a real error when the server fails to start, so
the batch file delegates to this short Python program (Python is already required
by the launcher).

What it does:
  1. Finds the project root from its own location, never from the caller's cwd.
  2. Reuses a server on 5500 only if that server is actually serving this project.
  3. Otherwise picks the first free port in 5500-5599 and starts
     `python -m http.server` bound to 127.0.0.1 with the project root as document
     root, in its own visible console window.
  4. Waits until the URL answers with the portfolio page before opening a browser.
  5. Opens the homepage and, when present, JSON Editor Studio.

Safety: binds to loopback only, never kills another process, never installs
anything, never writes into data/. A busy port that belongs to another program is
skipped, not terminated.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
PORT_RANGE = range(5500, 5600)  # preferred 5500, then the next free port
ROOT = Path(__file__).resolve().parent.parent
EDITOR_RELATIVE = Path("tools") / "json-editor" / "index.html"
READY_MARKER = "Er Shubham Bhagat"  # present in index.html and the rendered title
READY_TIMEOUT_SECONDS = 12.0


def banner(lines: list[str]) -> None:
    """Print the startup block the batch window keeps visible."""
    print("=" * 62)
    print("        PORTFOLIO LOCAL DEVELOPMENT SERVER")
    print("=" * 62)
    print()
    for line in lines:
        print(line)
    print()
    print("=" * 62)


def fetch_probe(port: int) -> str | None:
    """
    Return the first bytes of the page served on `port`, or None.

    Used for two decisions: is this port free (connection refused -> free), and
    does a busy port already serve this project (marker present -> reuse).
    """
    url = f"http://{HOST}:{port}/"
    try:
        with urllib.request.urlopen(url, timeout=1.5) as response:
            if response.status != 200:
                return None
            return response.read(4096).decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return None


def port_is_free(port: int) -> bool:
    """
    Check for a listener first, then try to bind.

    Why not bind with SO_REUSEADDR: on Windows that option allows a second bind to
    a port that is already listening, so the check would report a busy port as
    free and the real server would fail later. connect_ex detects the listener;
    the bind then verifies the port is genuinely available.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener_probe:
        listener_probe.settimeout(0.4)
        if listener_probe.connect_ex((HOST, port)) == 0:
            return False

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as bind_probe:
        try:
            bind_probe.bind((HOST, port))
            return True
        except OSError:
            return False


def find_target() -> tuple[int, bool]:
    """
    Choose a port.

    Returns (port, needs_start):
      - a free port -> start our server there;
      - a busy port that serves this portfolio -> reuse it, start nothing;
      - otherwise keep looking.
    """
    for port in PORT_RANGE:
        if port_is_free(port):
            return port, True

        page = fetch_probe(port)
        if page and READY_MARKER in page:
            return port, False

    raise RuntimeError(
        "No free port was found in 5500-5599. Stop the program using one of those "
        "ports, or change PORT_RANGE in scripts/start-local.py."
    )


def wait_until_ready(port: int) -> bool:
    """
    Poll the URL until it serves the portfolio marker.

    A fixed sleep would claim success before the server can answer; this checks
    the actual response instead. The timeout is generous because a cold Python
    start on Windows can take a few seconds.
    """
    deadline = time.time() + READY_TIMEOUT_SECONDS
    while time.time() < deadline:
        page = fetch_probe(port)
        if page and READY_MARKER in page:
            return True
        time.sleep(0.25)
    return False


def start_server(port: int) -> subprocess.Popen:
    """
    Start the static server in its own console so its log stays visible.

    Document root is the project root, not data/ or tools/: the page loads CSS,
    JS, JSON and nested tools through relative paths, and all of them must resolve.
    """
    command = [sys.executable, "-m", "http.server", str(port), "--bind", HOST]
    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

    return subprocess.Popen(
        command,
        cwd=str(ROOT),
        creationflags=creationflags,
        close_fds=True,
    )


def open_browser(url: str) -> None:
    """Open in the default browser, unless the caller suppresses it for testing."""
    if os.environ.get("PORTFOLIO_NO_BROWSER") == "1":
        print(f"Browser launch suppressed for testing: {url}")
        return

    try:
        opened = webbrowser.open(url, new=2)
    except OSError as error:
        print(f"Could not launch the browser for {url}: {error}")
        return

    if not opened:
        # A failed browser launch must not be reported as a successful start; the
        # URL is still printed above so the page can be opened by hand.
        print(f"The browser did not confirm it opened {url}. Open that URL manually.")


def main() -> int:
    if sys.version_info < (3, 9):
        banner([
            "ERROR: Python 3.9 or newer is required.",
            "",
            f"Running: {sys.version.split()[0]} ({sys.executable})",
            "Install a current Python 3 from https://www.python.org/downloads/.",
        ])
        return 1

    if not (ROOT / "index.html").is_file():
        banner([
            "ERROR: index.html was not found.",
            "",
            f"Project root: {ROOT}",
            "Place START_LOCAL_TEST.bat in the repository root (next to index.html).",
        ])
        return 1

    try:
        port, needs_start = find_target()
    except RuntimeError as error:
        banner(["ERROR: no usable port.", "", str(error)])
        return 1

    server: subprocess.Popen | None = None
    started = False

    if needs_start:
        print(f"Starting Python HTTP server on {HOST}:{port} ...")
        try:
            server = start_server(port)
            started = True
        except OSError as error:
            banner([
                "ERROR: the server could not be started.",
                "",
                str(error),
                "",
                "Check that Python can run `python -m http.server` and try again.",
            ])
            return 1

    if not wait_until_ready(port):
        banner([
            "ERROR: the server did not answer in time.",
            "",
            f"Tried: http://{HOST}:{port}/",
            "",
            "If a server window opened, read its error output.",
            "Otherwise run this file from a terminal to see the Python error:",
            f'  python "{Path(__file__).name}"',
        ])
        if server and started:
            # Stop only the process this script started; never touch another one.
            server.terminate()
        return 1

    home_url = f"http://{HOST}:{port}/"
    editor_path = EDITOR_RELATIVE.parent.as_posix()
    editor_url = f"http://{HOST}:{port}/{editor_path}/"
    editor_exists = (ROOT / EDITOR_RELATIVE).is_file()

    open_browser(home_url)
    if editor_exists:
        open_browser(editor_url)

    banner([
        f"Project root:   {ROOT}",
        "",
        "Server status:  RUNNING" if started else "Server status:  REUSED (already running)",
        "Server:         Python http.server (loopback only)",
        "",
        f"Portfolio:      {home_url}",
        f"JSON Editor:    {editor_url}" if editor_exists else "JSON Editor:    not available (tools/json-editor/index.html missing)",
        "",
        "Stop the server:",
        "  Close the separate server console window (the one printing requests),",
        "  or press CTRL+C in that window.",
        "",
        "This launcher window can be closed; the server window stays open.",
    ])

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nLauncher interrupted. The server window, if opened, is unchanged.")
        raise SystemExit(130)
