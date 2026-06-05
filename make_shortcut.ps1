$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut($DesktopPath + '\Jeeves 3.lnk')
$Shortcut.TargetPath = 'C:\Users\Vladimir\.gemini\antigravity\scratch\Jeeves 3\run_jeeves3.bat'
$Shortcut.WorkingDirectory = 'C:\Users\Vladimir\.gemini\antigravity\scratch\Jeeves 3'
$Shortcut.IconLocation = 'C:\Users\Vladimir\.gemini\antigravity\scratch\Jeeves 3\assets\jeeves3.ico,0'
$Shortcut.Save()
