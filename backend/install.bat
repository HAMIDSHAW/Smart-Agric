@echo off
echo.
echo ========================================
echo  SmartAgri Backend — Installing packages
echo ========================================
echo.

REM Step 1: Install everything except the problem packages
echo [1/4] Installing core Flask packages...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Core install failed. Check your internet connection.
    pause
    exit /b 1
)

REM Step 2: Install psycopg2 using pre-compiled binary from unofficial wheels
echo.
echo [2/4] Installing PostgreSQL driver (psycopg2)...
pip install psycopg2-binary --only-binary :all: --find-links https://download.lfd.uci.edu/pythonlibs/archived/
if %errorlevel% neq 0 (
    echo Trying alternative psycopg2 install...
    pip install "psycopg2-binary" --pre
    if %errorlevel% neq 0 (
        echo WARNING: psycopg2 could not be installed via pip.
        echo Installing pg8000 as alternative PostgreSQL driver...
        pip install pg8000
    )
)

REM Step 3: Install Pillow pre-built
echo.
echo [3/4] Installing Pillow (image processing)...
pip install Pillow --only-binary :all:
if %errorlevel% neq 0 (
    echo Trying Pillow pre-release...
    pip install Pillow --pre --only-binary :all:
    if %errorlevel% neq 0 (
        echo WARNING: Pillow could not be installed. Image upload will use basic mode.
    )
)

echo.
echo [4/4] Done!
echo.
echo Now run: python init_db.py
echo Then run: python run_local.py
echo.
pause
