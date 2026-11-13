@echo off
chcp 65001 >nul
title 小学数学 · 简约网页版
cd /d "%~dp0apps\primary-math"
echo 正在启动小学数学网页版...
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5180"
node serve.mjs
echo.
echo 服务已退出。按任意键关闭窗口。
pause >nul
