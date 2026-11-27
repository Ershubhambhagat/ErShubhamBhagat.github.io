@echo off
rem ==========================================================================
rem  START_LOCAL_TEST.bat - one-click local portfolio server (Windows)
rem
rem  Double-click this file. It:
rem    1. uses its own folder as the project root, whatever the caller's cwd is;
rem    2. finds the Python launcher (py) or python on PATH;
rem    3. hands off to scripts\start-local.py, which picks a free port, starts
rem       the static server on 127.0.0.1, waits for a real HTTP response, and
rem       opens the portfolio (and the JSON editor when it exists);
rem    4. leaves the server running in its own console window.
rem
rem  No administrator rights, no installs, no changes to project files.
rem ==========================================================================

setlocal EnableExtensions
cd /d "%~dp0"

title Portfolio Local Test

set "PYTHON_CMD="

rem The py launcher is the supported way to find Python on Windows. Ask it for
rem Python 3 explicitly: a py.exe with only Python 2 registered must not be used.
rem Fall back to python.exe on PATH for installations without the launcher.
py -3 --version >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
) else (
    python --version >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    echo.
    echo ============================================================
    echo   Python 3 was not found.
    echo ============================================================
    echo.
    echo This launcher uses Python's built-in static server. Nothing
    echo is installed automatically.
    echo.
    echo   1. Install Python 3 from https://www.python.org/downloads/
    echo   2. Tick "Add python.exe to PATH" during installation.
    echo   3. Double-click this file again.
    echo.
    pause
    exit /b 1
)

rem Run the helper with this file's folder as the working directory. The helper
rem also resolves the root from its own path, so both stay correct even if the
rem launcher is started from a shortcut with a different "Start in" folder.
%PYTHON_CMD% "%~dp0scripts\start-local.py"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo ============================================================
    echo   Startup failed with exit code %EXIT_CODE%.
    echo   Read the message above for the actual reason.
    echo ============================================================
    echo.
    pause
)

endlocal & exit /b %EXIT_CODE%
