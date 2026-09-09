param([string]$OutputRoot = (Join-Path $PSScriptRoot '../data/raw/epicollect'))
$ErrorActionPreference = 'Stop'
$projectSlug = 'mycoponics-porterfield'
$formRef = '8a09dbeef84443df91d134da7b71b9e2_6a738dc33d46e'
$apiBase = 'https://five.epicollect.net/api/export'
$tables = [ordered]@{
    dates = ''
    chamber_conditions = "${formRef}_6a7412262bf6f"
    tube_observations = "${formRef}_6a73c6a20258a"
}
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$folder = Join-Path $OutputRoot $stamp
New-Item -ItemType Directory -Path $folder | Out-Null
$manifest = [ordered]@{project=$projectSlug; form_ref=$formRef; started_at_utc=$stamp; complete=$false; tables=@{}}
$manifestFile = Join-Path $folder 'manifest.json'
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestFile -Encoding UTF8
$script:lastRequest = [DateTime]::MinValue

function Get-ApiJson([string]$Url) {
    $delay = 25 - ([DateTime]::UtcNow - $script:lastRequest).TotalSeconds
    if ($delay -gt 0) { Start-Sleep -Seconds ([Math]::Ceiling($delay)) }
    $script:lastRequest = [DateTime]::UtcNow
    $result = Invoke-RestMethod -Uri $Url -TimeoutSec 60
    if ($result.errors) { throw ($result.errors | ConvertTo-Json -Depth 10) }
    return $result
}

$definition = Get-ApiJson "$apiBase/project/$projectSlug"
$definition | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $folder 'project.json') -Encoding UTF8
foreach ($name in $tables.Keys) {
    $rows = [System.Collections.Generic.List[object]]::new()
    $page = 1
    $expected = $null
    do {
        $url = "$apiBase/entries/${projectSlug}?form_ref=$formRef&map_index=0&per_page=500&format=json&page=$page"
        if ($tables[$name]) { $url += '&branch_ref=' + $tables[$name] }
        $response = Get-ApiJson $url
        if ($null -eq $response.data.entries -or $null -eq $response.meta.total) { throw "Unexpected response for $name" }
        $response | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $folder "${name}_page_$page.json") -Encoding UTF8
        if ($null -eq $expected) { $expected = [int]$response.meta.total }
        if ($expected -ne [int]$response.meta.total) { throw 'Records changed during export. Try again later.' }
        foreach ($entry in $response.data.entries) { $rows.Add($entry) }
        $page++
    } while ($page -le [int]$response.meta.last_page)
    if ($rows.Count -ne $expected) { throw "Incomplete table: $name" }
    $key = if ($tables[$name]) { 'ec5_branch_uuid' } else { 'ec5_uuid' }
    $ids = @($rows | ForEach-Object { $_.$key } | Sort-Object -Unique)
    if ($ids.Count -ne $rows.Count) { throw "Duplicate identifiers: $name" }
    $columns = [System.Collections.Generic.List[string]]::new()
    foreach ($row in $rows) {
        foreach ($property in $row.PSObject.Properties) {
            if (-not $columns.Contains($property.Name)) { $columns.Add($property.Name) }
        }
    }
    $flat = foreach ($row in $rows) {
        $record = [ordered]@{}
        foreach ($column in $columns) {
            $value = $row.$column
            if ($value -is [array] -or $value -is [pscustomobject]) { $value = ConvertTo-Json -InputObject $value -Depth 50 -Compress }
            $record[$column] = $value
        }
        [pscustomobject]$record
    }
    $flat | Export-Csv -LiteralPath (Join-Path $folder "$name.csv") -NoTypeInformation -Encoding UTF8
    $manifest.tables[$name] = @{rows=$rows.Count; pages=($page-1); branch_ref=$tables[$name]; endpoint=$url}
    Write-Output "${name}: $($rows.Count) records"
}
$manifest.complete = $true
$manifest.finished_at_utc = [DateTime]::UtcNow.ToString('o')
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestFile -Encoding UTF8
Write-Output "Saved snapshot: $folder"
