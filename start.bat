@echo off
REM ============================================================================
REM  CertiGuard - one-command launcher (Windows)
REM ----------------------------------------------------------------------------
REM  Verifies Node.js/npm, installs dependencies if missing, initializes the
REM  backend (DB migrations + crypto keys + optional demo seed), then starts the
REM  backend and frontend in separate windows and prints both URLs.
REM
REM  Usage (from a Command Prompt or by double-clicking):
REM     start.bat                 install (if needed), init, seed, run both
REM     start.bat --no-seed       skip demo data seeding
REM     start.bat --reinstall     force a clean dependency reinstall
REM ============================================================================

setlocal EnableDelayedExpansion

REM ---- Resolve project root (folder of this script) --------------------------
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "BACKEND_DIR=%SCRIPT_DIR%\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%\frontend"

if "%PORT%"=="" set "BACKEND_PORT=4000"
if not "%PORT%"=="" set "BACKEND_PORT=%PORT%"
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
echo [i] Detected operating system: Windows

REM ---- 1. Verify Node.js / npm ----------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [x] Node.js is not installed. Install Node.js 20+ from https://nodejs.org and re-run.
  echo     Tip: winget install OpenJS.NodeJS.LTS
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [x] npm is not available ^(it ships with Node.js^). Please reinstall Node.js.
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_V=%%v"
for /f "delims=" %%v in ('npm -v') do set "NPM_V=%%v"
echo [ok] Node !NODE_V! / npm !NPM_V!

REM ---- 2. Install dependencies if missing -----------------------------------
call :install_deps "%BACKEND_DIR%" backend || exit /b 1
call :install_deps "%FRONTEND_DIR%" frontend || exit /b 1

REM ---- 3. Initialize backend (migrations + keys) ----------------------------
echo [i] Initializing backend ^(database migrations + cryptographic keys^)...
pushd "%BACKEND_DIR%"
call npm run migrate --silent || (echo [x] Migration failed & popd & exit /b 1)
call npm run init:keys --silent || (echo [x] Key initialization failed & popd & exit /b 1)
popd
echo [ok] Database schema up to date; cryptographic keys ready

REM ---- 4. Optional demo seed ------------------------------------------------
if "%DO_SEED%"=="1" (
  echo [i] Seeding demo users and sample certificates...
  pushd "%BACKEND_DIR%"
  call npm run seed --silent || echo [!] Seed skipped/failed ^(continuing^).
  popd
  if "%CERTIGUARD_DEMO_PASSWORD%"=="" (set "DEMO_PW=DemoPass123!") else (set "DEMO_PW=%CERTIGUARD_DEMO_PASSWORD%")
  echo [ok] Demo accounts: issuer@demo.certiguard / verifier@demo.certiguard / student@demo.certiguard  ^(password: !DEMO_PW!^)
  echo [!] Create the administrator once with:
  echo       cd backend ^&^& set CERTIGUARD_ADMIN_EMAIL=admin@demo.certiguard ^&^& set CERTIGUARD_ADMIN_PASSWORD=AdminDemo123! ^&^& npm run bootstrap:admin
)

REM ---- 5. Start both servers in their own windows ---------------------------
echo [i] Starting backend ^(API^) on port %BACKEND_PORT%...
start "CertiGuard Backend" cmd /k "cd /d "%BACKEND_DIR%" ^&^& set PORT=%BACKEND_PORT% ^&^& npm run dev"

echo [i] Starting frontend ^(UI^) on port %FRONTEND_PORT%...
start "CertiGuard Frontend" cmd /k "cd /d "%FRONTEND_DIR%" ^&^& npm run dev"

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
if exist "%DEP_DIR%\node_modules" (
  if "%REINSTALL%"=="0" (
    echo [ok] %DEP_NAME% dependencies already installed
    exit /b 0
  )
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
