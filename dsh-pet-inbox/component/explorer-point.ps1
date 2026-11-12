param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference='Stop'
# 按完整目录路径匹配 Explorer 窗口，避免误选同名文件夹。
$shell=New-Object -ComObject Shell.Application
for($i=0;$i -lt 12;$i++){
    foreach($w in $shell.Windows()){
        try {
            if($w.Document.Folder.Self.Path -eq $Folder){
                Add-Type -Namespace Inbox -Name Window -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
"@
                if([Inbox.Window]::IsIconic([IntPtr]$w.HWND) -or ![Inbox.Window]::IsWindowVisible([IntPtr]$w.HWND)){continue}
                [Console]::WriteLine((@{x=[int]($w.Left+$w.Width*0.55);y=[int]($w.Top+$w.Height*0.55)} | ConvertTo-Json -Compress))
                exit 0
            }
        }catch{}
    }
    Start-Sleep -Milliseconds 120
}
exit 1
