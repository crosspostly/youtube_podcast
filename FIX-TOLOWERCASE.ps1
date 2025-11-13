Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host "Creating safeLower utility..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "utils" | Out-Null

@'
export function safeLower(val: unknown): string {
  return String(val ?? '').toLowerCase();
}
'@ | Set-Content -Path "utils/safeLower.ts" -Encoding UTF8

Write-Host "Utility created" -ForegroundColor Green
Write-Host "Processing files..." -ForegroundColor Cyan

Get-ChildItem -Path . -Include *.ts,*.tsx -Recurse -File | Where-Object { $_.FullName -notmatch "node_modules|dist|build" } | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    if ($content -match "\.toLowerCase\(\)") {
        Write-Host "Processing: $($file.Name)" -ForegroundColor Yellow
        
        $depth = ($file.DirectoryName -replace [regex]::Escape($PWD.Path), "" -split "\\").Count - 1
        $importPath = if ($depth -le 1) { "./utils/safeLower" } else { ("../" * ($depth - 1)) + "utils/safeLower" }
        
        if ($content -notmatch "import.*safeLower") {
            $content = "import { safeLower } from '$importPath';`n" + $content
        }
        
        $content = $content -creplace '\((\w+)\s*\|\|\s*[''"][\s]*[''"]\s*\)\.toLowerCase\(\)', 'safeLower($1)'
        $content = $content -creplace '(\w+)\?\.toLowerCase\(\)', 'safeLower($1)'
        
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        Write-Host "Updated: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green

git add .
git commit -m "fix: safe toLowerCase using safeLower util"
git push

Write-Host "Pushed to GitHub!" -ForegroundColor Green
