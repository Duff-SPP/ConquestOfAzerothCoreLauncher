Function un.checkAppRunning
  !insertmacro customCheckAppRunning
FunctionEnd

Function un.onInit
  SetOutPath $INSTDIR
  ${LogSet} on
  
  !insertmacro check64BitAndSetRegView

  # Parse command line for /S flag and set silent mode
  ${GetParameters} $R0
  ${GetOptions} $R0 "/S" $R1
  ${IfNot} ${Errors}
    SetSilent silent
  ${EndIf}
  
  ${If} ${Silent}
    call un.checkAppRunning
  ${else}
    !ifdef ONE_CLICK
      MessageBox MB_OKCANCEL "$(areYouSureToUninstall)" IDOK +2
      Quit

      # one-click installer executes uninstall section in the silent mode, but we must show message dialog if silent mode was not explicitly set by user (using /S flag)
      call un.checkAppRunning
      SetSilent silent
    !endif
  ${endIf}

  StrCpy $coaInitialInstDir "$INSTDIR"
  !insertmacro initMultiUser
  StrCpy $INSTDIR "$coaInitialInstDir"

  !ifmacrodef customUnInit
    !insertmacro customUnInit
  !endif
FunctionEnd

!ifndef UNINSTALL_SECTION_NAME
  !define UNINSTALL_SECTION_NAME "Uninstall"
!endif

Section "un.${UNINSTALL_SECTION_NAME}"
  SectionIn RO
  # for assisted installer we check it here to show progress
  !ifndef ONE_CLICK
    ${IfNot} ${Silent}
      call un.checkAppRunning
    ${endIf}
  !endif

  !insertmacro setLinkVars

  !ifmacrodef customUnInstall
    !insertmacro customUnInstall
  !endif

  !insertmacro customRemoveFiles

  ${ifNot} ${isKeepShortcuts}
    WinShell::UninstAppUserModelId "${APP_ID}"

    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      WinShell::UninstShortcut "$oldDesktopLink"
      Delete "$oldDesktopLink"
    !endif

    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      WinShell::UninstShortcut "$oldStartMenuLink"

      Delete "$oldStartMenuLink"
      ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
      ${ifNot} $R1 == ""
        RMDir "$SMPROGRAMS\$R1"
      ${endIf}
    !endif
  ${endIf}

  # refresh the desktop
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'

  !ifmacrodef unregisterFileAssociations
    !insertmacro unregisterFileAssociations
  !endif

  ; Player AppData is always preserved.

  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $R1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayIcon
  ${If} $R0 == $INSTDIR
  ${OrIf} $R1 == "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"
  ${EndIf}

  !ifdef ONE_CLICK
    !insertmacro quitSuccess
  !endif
SectionEnd

!ifmacrodef customUnInstallSection
  !insertmacro customUnInstallSection
!endif
