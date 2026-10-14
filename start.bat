@echo off
REM ============================================================================
REM  CertiGuard - one-command launcher (Windows)
REM ----------------------------------------------------------------------------
REM  Verifies Node.js/npm, installs dependencies if missing, initializes the
REM  backend (DB migrations + crypto keys + optional demo seed), then starts the
REM  backend and frontend in separate windows and prints both URLs.
REM
REM  Usage (from a Command Prompt, or right-click > Run, or double-click):
REM     start.bat                 install (if needed), init, seed, run both
REM     start.bat --no-seed       skip demo data seeding
REM     start.bat --reinstall     force a clean dependency reinstall
REM ============================================================================

setlocal EnableDelayedExpansion

REM ---- Resolve project root (folder of this script; %~dp0 ends with a backslash)
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "BACKEND_DIR=%SCRIPT_DIR%\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%\frontend"

if "%PORT%"=="" (set "BACKEND_PORT=4000") else (set "BACKEND_PORT=%PORT%")
set "FRONTEND_PORT=5173"

set "DO_SEED=1"
set "REINSTALL=0"
:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="--no-seed" set "DO_SEED=0"
if /i "%~1"=="--reinstall" set "REINSTALL=1"
shift
goto parse_args
:after_args

echo.
echo CertiGuard launcher
echo [i] Operating system: Windows
echo [i] Project folder:   %SCRIPT_DIR%

REM ---- Sanity: make sure backend/frontend folders actually exist here --------
if not exist "%BACKEND_DIR%\package.json" (
  echo [x] Could not find "%BACKEND_DIR%\package.json".
  echo     Place start.bat in the CertiGuard project root (the folder that contains
  echo     the "backend" and "frontend" folders^) and run it from there.
  pause
  exit /b 1
)
if not exist "%FRONTEND_DIR%\package.json" (
  echo [x] Could not find "%FRONTEND_DIR%\package.json".
  echo     Place start.bat in the CertiGuard project root and run it from there.
  pause
  exit /b 1
)

REM ---- 1. Verify Node.js / npm ----------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [x] Node.js is not installed. Install Node.js 20+ from https://nodejs.org and re-run.
  echo     Tip: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [x] npm is not available ^(it ships with Node.js^). Please reinstall Node.js.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_V=%%v"
for /f "delims=" %%v in ('npm -v') do set "NPM_V=%%v"
echo [ok] Node !NODE_V! / npm !NPM_V!

REM ---- 2. Install dependencies if missing -----------------------------------
call :install_deps "%BACKEND_DIR%" backend
if errorlevel 1 (pause & exit /b 1)
call :install_deps "%FRONTEND_DIR%" frontend
if errorlevel 1 (pause & exit /b 1)

REM ---- 3. Initialize backend (migrations + keys) ----------------------------
echo [i] Initializing backend ^(database migrations + cryptographic keys^)...
pushd "%BACKEND_DIR%"
call npm run migrate --silent
if errorlevel 1 (echo [x] Migration failed & popd & pause & exit /b 1)
call npm run init:keys --silent
if errorlevel 1 (echo [x] Key initialization failed & popd & pause & exit /b 1)
popd
echo [ok] Database schema up to date; cryptographic keys ready

REM ---- 4. Optional demo seed ------------------------------------------------
if "%DO_SEED%"=="1" (
  echo [i] Seeding demo users and sample certificates...
  pushd "%BACKEND_DIR%"
  call npm run seed --silent
  if errorlevel 1 echo [!] Seed skipped/failed ^(continuing^).
  popd
  if "%CERTIGUARD_DEMO_PASSWORD%"=="" (set "DEMO_PW=DemoPass123!") else (set "DEMO_PW=%CERTIGUARD_DEMO_PASSWORD%")
  echo [ok] Demo accounts: issuer@demo.certiguard / verifier@demo.certiguard / student@demo.certiguard  ^(password: !DEMO_PW!^)
  echo [!] Create the administrator once ^(in the backend folder^):
  echo       set CERTIGUARD_ADMIN_EMAIL=admin@demo.certiguard ^& set CERTIGUARD_ADMIN_PASSWORD=AdminDemo123! ^& npm run bootstrap:admin
)

REM ---- 5. Start both servers in their own windows ---------------------------
REM  Use start /D "<workdir>" so the new window's working directory is set
REM  WITHOUT nesting quotes inside the cmd /k command string. This is what fixes
REM  the "system cannot find the path" error on paths that contain spaces.
echo [i] Starting backend ^(API^) on port %BACKEND_PORT%...
start "CertiGuard Backend" /D "%BACKEND_DIR%" cmd /k "set PORT=%BACKEND_PORT%&& npm run dev"

echo [i] Starting frontend ^(UI^) on port %FRONTEND_PORT%...
start "CertiGuard Frontend" /D "%FRONTEND_DIR%" cmd /k "npm run dev"

REM ---- 6. Print URLs --------------------------------------------------------
timeout /t 2 /nobreak >nul
echo.
echo ========================================================
echo   CertiGuard is starting up
echo --------------------------------------------------------
echo   Frontend (open this):  http://localhost:%FRONTEND_PORT%
echo   Backend API:           http://localhost:%BACKEND_PORT%/api
echo   API health check:      http://localhost:%BACKEND_PORT%/api/health
echo --------------------------------------------------------
echo   The backend and frontend each run in their own window.
echo   Close those windows (or press Ctrl+C in them) to stop.
echo ========================================================
echo.
echo [i] Tip: the first start may take ~10-20s while the servers compile.
echo         If the page says "cannot connect", wait a few seconds and refresh.
pause
exit /b 0

REM ===========================================================================
REM  install_deps "<dir>" <name>
REM ===========================================================================
:install_deps
set "DEP_DIR=%~1"
set "DEP_NAME=%~2"
if not exist "%DEP_DIR%" (
  echo [x] Missing directory: %DEP_DIR%
  exit /b 1
)
if "%REINSTALL%"=="1" (
  echo [!] Reinstalling %DEP_NAME% dependencies ^(clean^)...
  if exist "%DEP_DIR%\node_modules" rmdir /s /q "%DEP_DIR%\node_modules"
)
if exist "%DEP_DIR%\node_modules" if "%REINSTALL%"=="0" (
  echo [ok] %DEP_NAME% dependencies already installed
  exit /b 0
)
echo [i] Installing %DEP_NAME% dependencies ^(this can take a minute^)...
pushd "%DEP_DIR%"
call npm install
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
  echo [x] %DEP_NAME% dependency install failed
  exit /b 1
)
echo [ok] %DEP_NAME% dependencies installed
exit /b 0
