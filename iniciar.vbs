Set WshShell = CreateObject("WScript.Shell")
' Executa o inicializador em lote de forma oculta (0 = oculto, sem janela preta de terminal)
WshShell.Run "cmd /c iniciar.bat", 0, False
