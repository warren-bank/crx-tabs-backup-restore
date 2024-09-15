@echo off

set ext_name=tabs-backup-restore

set ext_dir_base=%~dp0..\..
set ext_dir_name=%ext_name%

set _CD=%cd%
cd /D "%ext_dir_base%"
set ext_dir_base=%cd%
cd /D "%_CD%"
set _CD=

set ext_dir=%ext_dir_base%\%ext_dir_name%
set ext_crx_default=%ext_dir%.crx

set ext_key=%ext_dir_base%\%ext_name%.pem
set ext_crx2=%ext_dir_base%\%ext_name%.crx2.crx
set ext_crx3=%ext_dir_base%\%ext_name%.crx3.crx
set ext_xpi=%ext_dir_base%\%ext_name%.unsigned.xpi

set file_assertion_build_ok=%ext_dir%\background.js
