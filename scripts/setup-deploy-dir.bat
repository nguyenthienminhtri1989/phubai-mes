@echo off
echo ============================================
echo  PHUBAI-MES: Setup deploy directory
echo ============================================

echo.
echo [1/3] Stop old PM2 MES processes...
cd /d "D:\actions-runner-mes\_work\phubai-mes\phubai-mes"
if exist "node_modules\.bin\pm2.cmd" (
    set PM2_HOME=D:\actions-runner-mes\_work\phubai-mes\phubai-mes\.pm2
    node_modules\.bin\pm2.cmd stop phubai-mes-web 2>nul
    node_modules\.bin\pm2.cmd stop phubai-mes-energy-cron 2>nul
    echo    Done.
) else (
    echo    PM2 not found in old dir - skipping.
)

echo.
echo [2/3] Clear runner temp folder...
if exist "D:\actions-runner-mes\_work\_actions\_temp" (
    rmdir /s /q "D:\actions-runner-mes\_work\_actions\_temp"
    echo    Done.
) else (
    echo    Temp folder not found - skipping.
)

echo.
echo [3/3] Create deploy directory...
if not exist "D:\apps\phubai-mes" (
    mkdir "D:\apps\phubai-mes"
    echo    Created D:\apps\phubai-mes
) else (
    echo    D:\apps\phubai-mes already exists.
)

echo.
echo ============================================
echo  DONE! Now push code to GitHub to deploy.
echo ============================================
pause
