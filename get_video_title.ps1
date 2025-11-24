# Get video title from metadata.json
$ErrorActionPreference = "Stop"

try {
    $basePath = (Get-Location).Path
    $metadataFile = Join-Path $basePath "metadata.json"
    
    if (Test-Path $metadataFile) {
        $metadata = Get-Content $metadataFile | ConvertFrom-Json
        if ($metadata.title) {
            Write-Output $metadata.title
            exit 0
        }
    }
    
    # Fallback: check project_metadata.json
    $projectMetadataFile = Join-Path $basePath "project_metadata.json"
    if (Test-Path $projectMetadataFile) {
        $projectMetadata = Get-Content $projectMetadataFile | ConvertFrom-Json
        if ($projectMetadata.title) {
            Write-Output $projectMetadata.title
            exit 0
        }
    }
    
    # Final fallback
    Write-Output "video"
    exit 0
    
} catch {
    Write-Output "video"
    exit 0
}