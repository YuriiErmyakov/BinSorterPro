@echo off
rem BinSorter Pro for Unreal - builds the C++ module with RunUAT BuildPlugin and copies the binaries
rem back into AutoSortBinsPro\Binaries (the plugin folder itself is linked into the engine by install.bat).
rem Usage: build.bat [5.6]   (engine version, default 5.6)
setlocal
set VER=%1
if "%VER%"=="" set VER=5.6
set UE=C:\Program Files\Epic Games\UE_%VER%
set SRC=%~dp0AutoSortBinsPro
rem MSVC fails on non-ASCII paths, so build in C:\UEBuild
set OUT=C:\UEBuild\AutoSortBinsPro_%VER%

if exist "%OUT%" rmdir /s /q "%OUT%"
call "%UE%\Engine\Build\BatchFiles\RunUAT.bat" BuildPlugin -Plugin="%SRC%\AutoSortBinsPro.uplugin" -Package="%OUT%" -TargetPlatforms=Win64 -Rocket
if errorlevel 1 (
  echo BUILD FAILED
  exit /b 1
)
robocopy "%OUT%\Binaries" "%SRC%\Binaries" /MIR /R:2 /W:1 /NJH /NJS /NP >nul
if errorlevel 8 (
  echo BUILT, BUT COPY FAILED: close Unreal Editor and run again ^(the DLL is locked^)
  exit /b 2
)
echo BUILD OK: %SRC%\Binaries
exit /b 0
