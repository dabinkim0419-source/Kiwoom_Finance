@echo off
setlocal
cd /d "%~dp0"
title 계열사 대시보드 배포
echo ======================================================
echo  계열사 실적 대시보드 - 빌드 후 GitHub push (Vercel 자동배포)
echo ======================================================
echo.

echo [1/4] 원격 변경사항 가져오기 (git pull)
rem 수정 중인 파일은 잠시 보관했다가 pull 후 자동으로 되돌려 놓음(--autostash)
git pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo  !! git pull 실패 - 위 내용을 Claude에게 붙여넣어 주세요. push 하지 않았습니다.
  pause
  exit /b 1
)
echo.

echo [2/4] 빌드 확인 (npm run build)
call npm run build
if errorlevel 1 (
  echo.
  echo  !! 빌드 실패 - 위 오류 내용을 Claude에게 붙여넣어 주세요. push 하지 않았습니다.
  pause
  exit /b 1
)
echo.

echo [3/4] 커밋
set MSG=%~1
if "%MSG%"=="" set MSG=update: %date% %time:~0,5%
git add -A
git commit -m "%MSG%"
echo.

echo [4/4] GitHub push (Vercel 자동 배포 시작)
git push
if errorlevel 1 (
  echo.
  echo  !! push 실패 - 인터넷/GitHub 로그인 상태를 확인해 주세요.
  pause
  exit /b 1
)
echo.
echo ======================================================
echo  완료! 1~2분 뒤 https://daoukiwoom.vercel.app/ 에 반영됩니다.
echo  Claude에게 "배포됐어" 라고 알려주면 모바일 화면을 확인합니다.
echo ======================================================
pause
