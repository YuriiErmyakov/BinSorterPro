@echo off
rem AutoSortBins Pro for Unreal - links the plugin into the engine (all projects of that version get it).
rem Usage: install.bat [5.6]      uninstall: install.bat 5.6 remove
rem The C++ binaries must be built for that engine version first (build.bat 5.6).
setlocal
set VER=%1
if "%VER%"=="" set VER=5.6
set DST=C:\Program Files\Epic Games\UE_%VER%\Engine\Plugins\Marketplace\AutoSortBinsPro
if exist "%DST%" rmdir "%DST%"
if /i "%2"=="remove" (
  echo removed %DST%
  exit /b 0
)
if not exist "C:\Program Files\Epic Games\UE_%VER%\Engine\Plugins\Marketplace" mkdir "C:\Program Files\Epic Games\UE_%VER%\Engine\Plugins\Marketplace"
mklink /J "%DST%" "%~dp0AutoSortBinsPro"
echo Restart Unreal Editor %VER%: Window ^> Tools ^> AutoSortBins Pro opens the panel.
