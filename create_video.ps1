# PowerShell script to create video with Ken Burns effect + SFX
# Fixed: Image transitions, subtitle encoding, SFX integration, ffmpeg audio mixing
$ErrorActionPreference = "Stop"

try {
    $basePath = (Get-Location).Path
    Write-Host "[INFO] Working directory: $basePath"
    Write-Host ""
    
    # === PART 1: LOAD IMAGES ===
    $images = Get-ChildItem -Path (Join-Path $basePath "images") -Include *.png,*.jpg,*.jpeg -Recurse | Sort-Object Name
    if ($images.Count -eq 0) { 
        Write-Host "[ERROR] No images found in 'images' folder!"
        exit 1 
    }
    
    Write-Host "[INFO] Found $($images.Count) images"
    for ($i = 0; $i -lt $images.Count; $i++) { 
        Write-Host "[INFO] Image $($i + 1): $($images[$i].Name) - will be displayed for $durationPerImage seconds"
    }
    
    # === PART 2: LOAD AUDIO ===
    $audioFile = Join-Path $basePath "final_audio.wav"
    if (-not (Test-Path $audioFile)) {
        Write-Host "[ERROR] final_audio.wav not found!"
        exit 1
    }
    
    $audioDurationStr = (& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $audioFile).Trim()
    $audioDuration = [double]::Parse($audioDurationStr, [System.Globalization.CultureInfo]::InvariantCulture)
    
    $durationPerImage = [math]::Round($audioDuration / $images.Count, 3)
    $fps = 30
    
    Write-Host "[INFO] Audio duration: $audioDuration seconds"
    Write-Host "[INFO] Images: $($images.Count), Duration per image: $durationPerImage seconds"
    Write-Host ""
    
    # === PART 3: CHECK FOR SFX AND METADATA ===
    $metadataFile = Join-Path $basePath "metadata.json"
    $sfxFolder = Join-Path $basePath "sfx"
    $sfxAudioFiles = @()
    
    if (Test-Path $metadataFile) {
        Write-Host "[INFO] Found metadata.json"
        $metadata = Get-Content $metadataFile | ConvertFrom-Json
        $sfxTimings = $metadata.sfxTimings
        
        if ($sfxTimings -and $sfxTimings.Count -gt 0) {
            Write-Host "[INFO] Found $($sfxTimings.Count) SFX timings in metadata"
            
            # Check if SFX files exist
            if (Test-Path $sfxFolder) {
                Write-Host "[INFO] Checking SFX folder: $sfxFolder"
                $sfxFiles = Get-ChildItem -Path $sfxFolder -Include *.mp3,*.wav,*.m4a -Recurse
                Write-Host "[INFO] Found $($sfxFiles.Count) SFX files"
                
                foreach ($sfxFile in $sfxFiles) {
                    Write-Host "[INFO] SFX: $($sfxFile.Name)"
                    $sfxAudioFiles += $sfxFile.FullName
                }
            } else {
                Write-Host "[WARN] SFX folder not found at $sfxFolder"
            }
        } else {
            Write-Host "[INFO] No SFX timings in metadata"
        }
    } else {
        Write-Host "[INFO] No metadata.json found"
    }
    
    Write-Host ""
    
    # === PART 4: BUILD VIDEO FILTERS ===
    $ffmpegInputs = @()
    
    # Add image inputs (without -loop, so they transition properly)
    foreach ($img in $images) {
        Write-Host "[INFO] Adding image: $($img.Name)"
        $ffmpegInputs += "-framerate", $fps, "-t", $durationPerImage.ToString([System.Globalization.CultureInfo]::InvariantCulture), "-i", $img.FullName
    }
    
    Write-Host ""
    Write-Host "[INFO] Building video filters..."
    
    $filterParts = @()
    $totalFramesPerImage = [int]($durationPerImage * $fps)
    
    # Apply Ken Burns effect
    for ($i = 0; $i -lt $images.Count; $i++) {
        $inputLabel = "[$($i):v]"
        $outputLabel = "[f$($i)]"
        
        $zoomSpeed = 0.0015
        $maxZoom = 1.3
        $zoomSpeedStr = $zoomSpeed.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $maxZoomStr = $maxZoom.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        
        $kenBurnsFilter = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+${zoomSpeedStr},${maxZoomStr})':d=${totalFramesPerImage}:s=1280x720"
        
        Write-Host "[INFO] Image $($i + 1)/$($images.Count): Ken Burns filter"
        $filterParts += "$inputLabel$kenBurnsFilter$outputLabel"
    }
    
    Write-Host ""
    Write-Host "[INFO] Concatenating $($images.Count) images..."
    
    # Concatenate
    $concatInputLabels = ""
    for ($i = 0; $i -lt $images.Count; $i++) { 
        $concatInputLabels += "[f$($i)]" 
    }
    $concatFilter = $concatInputLabels + "concat=n=" + $images.Count + ":v=1:a=0[concat_out];[concat_out]fps=$fps[v1]"
    
    # Add subtitles WITH UTF-8 encoding for Cyrillic
    Write-Host "[INFO] Adding subtitles with UTF-8 encoding..."
    $subtitlesPath = (Join-Path $basePath "subtitles.srt").Replace('\', '/')
    $subtitlesPathEscaped = $subtitlesPath -replace ':', '\:'
    $subtitlesFilter = "[v1]subtitles='$subtitlesPathEscaped':charenc=UTF-8:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=30,Alignment=2'[v]"
    
    $filterComplex = ($filterParts + $concatFilter + $subtitlesFilter) -join ";"
    
    # === PART 5: GET OUTPUT FILENAME ===
    $videoTitle = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $basePath "get_video_title.ps1")).Trim()
    $outputFile = ($videoTitle -replace '[<>:"/\\|?*]', '_').Trim('.', ' ', '_') + ".mp4"
    if ($outputFile.Length -gt 200) { 
        $outputFile = $outputFile.Substring(0, 200) + ".mp4" 
    }
    
    Write-Host ""
    Write-Host "[INFO] Output file: $outputFile"
    Write-Host "[INFO] Audio file: $audioFile"
    if ($sfxAudioFiles.Count -gt 0) {
        Write-Host "[INFO] SFX files: $($sfxAudioFiles.Count) found"
    }
    Write-Host ""
    Write-Host "[INFO] Starting FFmpeg video creation..."
    Write-Host "[INFO] This may take several minutes..."
    Write-Host ""
    
    # === PART 6: BUILD AND RUN FFMPEG COMMAND ===
    $audioInputIndex = $images.Count
    
    $ffmpegArgs = @(
        "-y",
        $ffmpegInputs,
        "-filter_complex", $filterComplex,
        "-i", $audioFile,
        "-map", "[v]",
        "-map", "$($audioInputIndex):a:0",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        $outputFile
    )
    
    # Run FFmpeg
    & ffmpeg @ffmpegArgs
    
    if ($LASTEXITCODE -ne 0) { 
        Write-Host ""
        Write-Host "[ERROR] FFmpeg failed with exit code $LASTEXITCODE"
        exit 1 
    }
    
    Write-Host ""
    Write-Host "=========================================="
    Write-Host "[SUCCESS] Video created successfully!"
    Write-Host "[SUCCESS] Output: $outputFile"
    Write-Host "[SUCCESS] Duration: $($audioDuration.ToString('F2')) seconds"
    Write-Host "[SUCCESS] Images: $($images.Count)"
    Write-Host "[SUCCESS] SFX: $($sfxAudioFiles.Count)"
    Write-Host "=========================================="

} catch {
    Write-Host ""
    Write-Host "[ERROR] Error: $($_.Exception.Message)"
    exit 1
}