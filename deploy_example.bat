@echo off
chcp 65001 >nul
echo ===================================
echo   一键推送并部署 hhwx 项目
echo ===================================

:: 1. 本地 Git 提交流程
set /p commit_msg="请输入 Commit 描述信息 (按回车跳过则使用默认信息): "
if "%commit_msg%"=="" set commit_msg="Update project"

echo.
echo [1/4] 添加更改到暂存区...
git add .

echo [2/4] 提交更改...
git commit -m "%commit_msg%"

echo [3/4] 推送到 GitHub...
git push origin main

:: 2. 远程触发部署流程
echo.
echo [4/4] 代码已推送！正在连接服务器执行部署...

:: ==============================================
:: ⚠️ 请在运行前替换下方这三个变量为你自己的真实信息
:: ==============================================
set SSH_KEY="C:\path\to\your\key.pem"
set SERVER_IP="你的服务器公网IP"
set SERVER_USER="ubuntu"
:: ==============================================

:: 通过 SSH 连接服务器并执行部署脚本
ssh -i %SSH_KEY% %SERVER_USER%@%SERVER_IP% "bash ~/hhwx/deploy.sh"

echo.
echo ===================================
echo   全部完成！生产环境已更新。
echo ===================================
pause