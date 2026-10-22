@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 -m scripts.beginner
) else (
    python -m scripts.beginner
)
pause
