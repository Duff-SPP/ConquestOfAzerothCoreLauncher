!macro moveFile FROM TO
  ClearErrors
  Rename `${FROM}` `${TO}`
  ${if} ${errors}
    # not clear - can NSIS rename on another drive or not, so, in case of error, just copy
    ClearErrors
    !insertmacro copyFile `${FROM}` `${TO}`
    Delete `${FROM}`
  ${endif}
!macroend

!macro copyFile FROM TO
  ${StdUtils.GetParentPath} $R5 `${TO}`
  CreateDirectory `$R5`
  ClearErrors
  CopyFiles /SILENT `${FROM}` `${TO}`
!macroend

Var /GLOBAL isTryToKeepShortcuts

!macro setIsTryToKeepShortcuts
  StrCpy $isTryToKeepShortcuts "true"
  !ifdef allowToChangeInstallationDirectory
    ${ifNot} ${isUpdated}
      StrCpy $isTryToKeepShortcuts "false"
    ${endIf}
  !endif
!macroend

# https://nsis-dev.github.io/NSIS-Forums/html/t-172971.html
!macro readReg VAR ROOT_KEY SUB_KEY NAME
  ${if} "${ROOT_KEY}" == "SHELL_CONTEXT"
    ReadRegStr "${VAR}" SHELL_CONTEXT "${SUB_KEY}" "${NAME}"
  ${elseif} "${ROOT_KEY}" == "HKEY_CURRENT_USER"
    ReadRegStr "${VAR}" HKEY_CURRENT_USER "${SUB_KEY}" "${NAME}"
  ${elseif} "${ROOT_KEY}" == "HKEY_LOCAL_MACHINE"
    ReadRegStr "${VAR}" HKEY_LOCAL_MACHINE "${SUB_KEY}" "${NAME}"
  ${else}
    MessageBox MB_OK "Unsupported ${ROOT_KEY}"
  ${endif}
!macroend

