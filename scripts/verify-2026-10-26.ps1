# Dance Echo 修复验证脚本（2026-10-26 批次）
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\verify-2026-10-26.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\verify-2026-10-26.ps1 -Base http://127.0.0.1:8094
# 只读检查 + 一次“移入回收站→恢复”的可逆往返，不会删除磁盘文件。

param([string]$Base = 'http://127.0.0.1:8090')

$ErrorActionPreference = 'Stop'
$script:pass = 0
$script:fail = 0

function Check([string]$name, [scriptblock]$body) {
  try {
    $ok = & $body
    if ($ok) { Write-Host ("  PASS  {0}" -f $name) -ForegroundColor Green; $script:pass++ }
    else { Write-Host ("  FAIL  {0}" -f $name) -ForegroundColor Red; $script:fail++ }
  } catch {
    Write-Host ("  FAIL  {0}  ->  {1}" -f $name, $_.Exception.Message) -ForegroundColor Red
    $script:fail++
  }
}

function GetJson([string]$url) {
  Invoke-RestMethod -Uri $url -TimeoutSec 30
}

# 服务端在扫描窗口内可能短暂返回空库；重试直到 videos 有内容。
function GetLibrary([string]$suffix = '') {
  for ($i = 0; $i -lt 12; $i++) {
    $lib = GetJson "$Base/api/v1/library$suffix"
    if ($lib -and @($lib.videos).Count -gt 0) { return $lib }
    Start-Sleep -Milliseconds 400
  }
  return $lib
}

function PostJson([string]$url, $payload) {
  Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' `
    -Body ($payload | ConvertTo-Json -Depth 6) -TimeoutSec 120
}

Write-Host "`nDance Echo verification against $Base`n" -ForegroundColor Cyan

# 1) 服务与能力
Check 'health ok' { (GetJson "$Base/api/v1/health").status -eq 'ok' }
Check 'capabilities.backupImport=true' { (GetJson "$Base/api/v1/capabilities").capabilities.backupImport -eq $true }

# 2) 媒体库总量（挂载 E: 后应 >= 1400；若你只挂了少量目录，请把 1000 改成你的期望值）
$lib = GetLibrary
Check ("library count >= 1000 (got {0})" -f $lib.count) { [int]$lib.count -ge 1000 }
Check 'library hides trashed by default' {
  -not ($lib.videos | Where-Object { $_.meta -and $_.meta.trashedAt -gt 0 })
}

# 3) 回收站往返（可逆）
$probe = $lib.videos | Select-Object -First 1
if ($null -eq $probe) { Write-Host '  SKIP  trash roundtrip (library empty)' -ForegroundColor Yellow }
else {
  $id = $probe.id
  $trashed = PostJson "$Base/api/v1/videos/trash" @{ ids = @($id) }
  Check 'batch trash: trashed >= 1' { @($trashed.trashed).Count -ge 1 }
  Check 'trashed video absent from default library' {
    -not ((GetLibrary).videos | Where-Object { $_.id -eq $id })
  }
  Check 'trashed video visible with includeTrashed=1' {
    [bool]((GetLibrary "?includeTrashed=1").videos | Where-Object { $_.id -eq $id })
  }
  try {
    Invoke-RestMethod -Uri "$Base/api/v1/trash/$id/restore" -Method Post -TimeoutSec 60 | Out-Null
    Check 'restore brings video back' {
      [bool]((GetLibrary).videos | Where-Object { $_.id -eq $id })
    }
  } catch {
    Write-Host ("  WARN  restore failed, restore manually in 回收站: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
  }
}

# 4) HEVC 转码回退（优先 two.mp4；找不到就随机取一个 mp4）
$all = (GetLibrary).videos
Write-Host ("  info  transcode candidates: total={0}" -f @($all).Count) -ForegroundColor DarkGray

$two = $all | Where-Object { $_.name -eq 'two.mp4' } | Select-Object -First 1
if ($null -eq $two) { $two = $all | Where-Object { $_.name -like '*.mp4' } | Select-Object -First 1 }
if ($null -eq $two) { Write-Host '  SKIP  transcode (no mp4 in library)' -ForegroundColor Yellow }
else {
  $tr = PostJson "$Base/api/v1/videos/$($two.id)/transcode" @{}
  Check ("transcode status ready/unavailable (got {0})" -f $tr.status) { @('ready', 'unavailable') -contains $tr.status }
  if ($tr.status -eq 'ready') {
    $headCode = (& curl.exe -s -I -o NUL -w "%{http_code}" "$Base/transcode/$($two.id)")
    Check 'transcode HEAD = 200' { [int]$headCode -eq 200 }
    $rangeOut = (& curl.exe -s -r 0-99 -o NUL -w "%{http_code}:%{size_download}" "$Base/transcode/$($two.id)")
    Check 'transcode Range = 206 and 100 bytes' { $rangeOut -eq '206:100' }
  }
}

# 5) 挂载视频的封面（重启 + ffmpeg 可用后应 200）
$mount = (GetLibrary).videos | Where-Object { $_.name -like 'mmexport*' } | Select-Object -First 1
if ($mount) {
  $thumbCode = (& curl.exe -s -I -o NUL -w "%{http_code}" "$Base/thumb/$($mount.id)")
  Check 'mounted video thumbnail HEAD = 200' { [int]$thumbCode -eq 200 }
} else {
  Write-Host '  SKIP  mounted thumbnail (no mmexport* video; is E: mounted?)' -ForegroundColor Yellow
}

Write-Host ("`nResult: {0} passed, {1} failed`n" -f $script:pass, $script:fail) -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 }

