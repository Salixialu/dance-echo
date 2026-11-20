# 通过 WMI 启动 DanceEcho Server：父进程是 WmiPrvSE，不属于任何 agent 任务对象，
# 因此不会被会话/后台作业结束时连带杀掉，且完整继承当前用户环境（可正常调用 ffmpeg）。
$ErrorActionPreference = 'Stop'
$dir = 'D:\Dance Echo\DanceEcho Server'

$running = $false
try {
  $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/v1/health' -TimeoutSec 2 -UseBasicParsing
  $running = $true
} catch { }

if ($running) {
  Write-Output 'already-running'
  exit 0
}

$cmd = 'cmd.exe /c node server.mjs > data\out.log 2> data\err.log'
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine      = $cmd
  CurrentDirectory = $dir
}

if ($result.ReturnValue -ne 0) {
  Write-Output "create-failed:$($result.ReturnValue)"
  exit 1
}

Write-Output "started:$($result.ProcessId)"
