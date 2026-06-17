!macro NSIS_HOOK_PREINSTALL
  ; Tauri's generated installer also checks this later, but doing it here lets
  ; us verify the target executable before any registry keys or shortcuts are
  ; written.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ClearErrors
  FileOpen $0 "$INSTDIR\.__orbitstart_write_test.tmp" w
  ${If} ${Errors}
    MessageBox MB_ICONSTOP|MB_OK "OrbitStart cannot write to the selected installation folder:$\r$\n$\r$\n$INSTDIR$\r$\n$\r$\nPlease choose the default per-user location or run the installer with a folder you can write to."
    Abort
  ${Else}
    FileClose $0
    Delete "$INSTDIR\.__orbitstart_write_test.tmp"
  ${EndIf}

  IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" orbitstart_try_remove_existing orbitstart_preinstall_done

  orbitstart_try_remove_existing:
    ClearErrors
    Delete "$INSTDIR\${MAINBINARYNAME}.exe"
    IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" orbitstart_existing_locked orbitstart_preinstall_done

  orbitstart_existing_locked:
    MessageBox MB_ICONSTOP|MB_OK "OrbitStart cannot replace the existing executable:$\r$\n$\r$\n$INSTDIR\${MAINBINARYNAME}.exe$\r$\n$\r$\nPlease exit OrbitStart from the system tray, make sure the file is not locked by another program, then run the installer again. Do not choose Ignore; that leaves shortcuts without the application executable."
    Abort

  orbitstart_preinstall_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" orbitstart_postinstall_done orbitstart_missing_main_binary

  orbitstart_missing_main_binary:
    Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    Delete "$INSTDIR\uninstall.exe"
    DeleteRegKey SHCTX "${UNINSTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUPRODUCTKEY}"
    RMDir "$INSTDIR"
    MessageBox MB_ICONSTOP|MB_OK "OrbitStart installation did not complete because the main executable was not written. Please rerun the installer and do not choose Ignore on file write errors."
    Abort

  orbitstart_postinstall_done:
!macroend
