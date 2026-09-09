param([string]$Destination = 'data/epicollect', [switch]$Full)
$ErrorActionPreference = 'Stop'
$form = '8a09dbeef84443df91d134da7b71b9e2_6a738dc33d46e'
$base = 'https://five.epicollect.net/api/export/entries/mycoponics-porterfield'
$tables = [ordered]@{dates=''; chamber_conditions="${form}_6a7412262bf6f"; tube_observations="${form}_6a73c6a20258a"}
$started = [DateTimeOffset]::UtcNow
$statePath = Join-Path $Destination 'sync-state.json'
$oldState = if (Test-Path $statePath) { Get-Content -Raw $statePath | ConvertFrom-Json } else { $null }
$rebuild = $Full -or -not $oldState
if ($oldState -and ($started - [DateTimeOffset]::Parse($oldState.last_full_sync)).TotalDays -ge 7) { $rebuild = $true }
$since = if ($oldState) { [DateTimeOffset]::Parse($oldState.checked_through).AddMinutes(-5).ToString('o') } else { '' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('mycoponics-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $stage | Out-Null
$script:lastRequest = [DateTime]::MinValue
function Read-Api([string]$Url) {
    for ($attempt=0; $attempt -lt 3; $attempt++) {
        $delay = 25 - ([DateTime]::UtcNow - $script:lastRequest).TotalSeconds
        if ($delay -gt 0) { Start-Sleep -Seconds ([Math]::Ceiling($delay)) }
        $script:lastRequest = [DateTime]::UtcNow
        try {
            $r = Invoke-RestMethod -Uri $Url -TimeoutSec 60
            if ($r.errors) { throw 'EpiCollect returned an API error.' }
            if ($null -eq $r.meta.total -or $r.data.PSObject.Properties.Name -notcontains 'entries') { throw 'Unexpected API response; existing data will not be published over.' }
            return $r
        } catch {
            if ($attempt -eq 2) { throw }
            Start-Sleep -Seconds 60
        }
    }
}
$counts = [ordered]@{}
foreach ($name in $tables.Keys) {
    $key = if ($tables[$name]) { 'ec5_branch_uuid' } else { 'ec5_uuid' }
    $cache = Join-Path $Destination "$name.json"
    $records = @{}
    if (-not $rebuild) {
        if (-not (Test-Path $cache)) { throw "Missing $cache; use the full refresh option." }
        foreach ($row in (Get-Content -Raw $cache | ConvertFrom-Json)) { $records[$row.$key] = $row }
    }
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    $page = 1
    $total = $null
    do {
        $url = "${base}?form_ref=$form&map_index=0&format=json&per_page=500&page=$page"
        if ($tables[$name]) { $url += '&branch_ref=' + $tables[$name] }
        if (-not $rebuild) { $url += '&filter_by=uploaded_at&filter_from=' + [Uri]::EscapeDataString($since) }
        $r = Read-Api $url
        if ($null -eq $total) { $total = [int]$r.meta.total }
        if ($total -ne [int]$r.meta.total) { throw 'Data changed during pagination; retry later.' }
        foreach ($row in $r.data.entries) {
            $id = [string]$row.$key
            if (-not $id -or -not $seen.Add($id)) { throw "Missing or duplicate identifier in $name" }
            $records[$id] = $row
        }
        $page++
    } while ($page -le [int]$r.meta.last_page)
    if ($seen.Count -ne $total) { throw "Incomplete API response for $name" }
    if ($rebuild -and $oldState -and $total -eq 0 -and $oldState.counts.$name -gt 0) { throw "Unexpected empty $name; inspect the project before replacing existing data." }
    $rows = @($records.Values | Sort-Object -Property $key)
    ConvertTo-Json -InputObject $rows -Depth 100 | Set-Content -LiteralPath (Join-Path $stage "$name.json") -Encoding utf8
    $columns = @($rows | ForEach-Object { $_.PSObject.Properties.Name } | Sort-Object -Unique)
    if (-not $columns) { $columns = @($key) }
    $flat = @(foreach ($row in $rows) {
        $record = [ordered]@{}
        foreach ($column in $columns) {
            $value = $row.$column
            if ($value -is [array] -or $value -is [pscustomobject]) { $value = ConvertTo-Json -InputObject $value -Depth 100 -Compress }
            $record[$column] = $value
        }
        [pscustomobject]$record
    })
    $csvPath = Join-Path $stage "$name.csv"
    if ($flat.Count) { $flat | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding utf8 }
    else { ('"' + ($columns -join '","') + '"') | Set-Content -LiteralPath $csvPath -Encoding utf8 }
    $counts[$name] = $rows.Count
    Write-Output "${name}: $($rows.Count) saved records; $($seen.Count) received this run"
}
$state = [ordered]@{
    project='mycoponics-porterfield'; form_ref=$form; complete=$true
    checked_through=$started.ToString('o')
    last_full_sync=$(if ($rebuild) { $started.ToString('o') } else { $oldState.last_full_sync })
    mode=$(if ($rebuild) { 'full' } else { 'incremental' })
    counts=$counts
}
$state | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $stage 'sync-state.json') -Encoding utf8
# Publish files only after all three tables have passed validation.
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
Get-ChildItem -LiteralPath $stage -File | Copy-Item -Destination $Destination -Force
Write-Output 'All three tables validated; ready for a GitHub commit.'
