# PowerShell-скрипт для автоматической докачки всех недостающих файлов музыки и SFX
# Ищет все [LINK]_*.txt в папках music/ и sfx/, скачивает mp3 по Source URL, удаляет txt

$folders = @('music', 'sfx')
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) { continue }
    Get-ChildItem -Path $folder -Filter '[LINK]*.txt' | ForEach-Object {
        $txtPath = $_.FullName
        $lines = Get-Content $txtPath
        $url = $null
        foreach ($line in $lines) {
            if ($line -match 'Source URL:\s*(.+)') {
                $url = $Matches[1].Trim()
                break
            }
        }
        if ($url) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($txtPath)
            $mp3Name = $baseName.Replace('[LINK]_', '') + '.mp3'
            $mp3Path = Join-Path $folder $mp3Name
            Write-Host "[INFO] Downloading $url -> $mp3Name ..."
            try {
                Invoke-WebRequest -Uri $url -OutFile $mp3Path -UseBasicParsing
                Write-Host "[SUCCESS] Downloaded: $mp3Name"
                Remove-Item $txtPath
            } catch {
                Write-Host "[ERROR] Failed to download $url"
            }
        } else {
            Write-Host "[WARNING] No Source URL found in $txtPath"
        }
    }
}
Write-Host "[INFO] Asset auto-download complete."
