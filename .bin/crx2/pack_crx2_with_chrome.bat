@echo off

call "%~dp0..\.env\constants.bat"
call "%~dp0..\.env\chrome_crx2.bat"
call "%~dp0..\.common\pack_crx_with_chrome.bat"

if exist "%ext_crx_default%" (
  move "%ext_crx_default%" "%ext_crx2%"
)

if not defined BUILD_ALL (
  echo.
  pause
)
