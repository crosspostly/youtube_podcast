// hooks/podcast/scriptTemplates.ts

// This file centralizes all the large, static script templates used for generating the downloadable ZIP archive.

export const GET_VIDEO_TITLE_PS1 = `
# PowerShell script to get the video title
$ErrorActionPreference = "SilentlyContinue"
$basePath = (Get-Location).Path
$title = ""

# 1. Try VIDEO_TITLE.txt (highest priority)
$videoTitlePath = Join-Path $basePath "VIDEO_TITLE.txt"
if (Test-Path $videoTitlePath) {
    $title = (Get-Content $videoTitlePath -Raw).Trim()
}

# 2. If not found, try youtube_details.txt
if (-not $title) {
    $detailsPath = Join-Path $basePath "youtube_details.txt"
    if (Test-Path $detailsPath) {
        $content = Get-Content $detailsPath -Raw
        # Regex to find text after "TITLE:" until a line of dashes or end of file
        if ($content -match "(?sm)TITLE:\\s*([\\s\\S]*?)(?:\\n----|$)") {
            $title = $Matches[1].Trim()
        }
    }
}

# 3. Fallback to a default name if still not found
if (-not $title) {
    $title = "final_video"
}

Write-Output $title
`;

export const SYNC_SUBTITLES_PS1 = `
# PowerShell script to synchronize subtitles with audio duration
$ErrorActionPreference = "Continue"

try {
    $basePath = (Get-Location).Path
    Write-Host "[INFO] Synchronizing subtitles with audio..."
    
    # Get audio duration
    $audioFile = Join-Path $basePath "final_audio.wav"
    if (-not (Test-Path $audioFile)) { Write-Host "[ERROR] final_audio.wav not found!"; exit 1 }
    
    $audioDurationStr = (& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $audioFile).Trim()
    $audioDuration = [double]::Parse($audioDurationStr, [System.Globalization.CultureInfo]::InvariantCulture)
    
    Write-Host "[INFO] Audio duration: $audioDuration seconds"
    
    # Read subtitles file
    $subtitlesPath = Join-Path $basePath "subtitles.srt"
    if (-not (Test-Path $subtitlesPath)) { Write-Host "[ERROR] subtitles.srt not found!"; exit 1 }
    
    $subtitlesContent = Get-Content $subtitlesPath -Raw
    
    # Find the last timestamp
    $lastTimestampPattern = "(\\d{2}):(\\d{2}):(\\d{2}),(\\d{3})\\s*-->\\s*(\\d{2}):(\\d{2}):(\\d{2}),(\\d{3})"
    $matches = [regex]::Matches($subtitlesContent, $lastTimestampPattern)
    
    if ($matches.Count -eq 0) { Write-Host "[ERROR] No timestamps found in subtitles!"; exit 1 }
    
    $lastMatch = $matches[$matches.Count - 1]
    $lastSubtitleTime = ([int]$lastMatch.Groups[5].Value * 3600) + ([int]$lastMatch.Groups[6].Value * 60) + [int]$lastMatch.Groups[7].Value + ([int]$lastMatch.Groups[8].Value / 1000.0)
    
    Write-Host "[INFO] Last subtitle timestamp: $lastSubtitleTime seconds"
    
    if ($lastSubtitleTime -eq 0) { Write-Host "[ERROR] Invalid last subtitle time!"; exit 1 }
    
    $scaleFactor = $audioDuration / $lastSubtitleTime
    Write-Host "[INFO] Scaling factor: $scaleFactor"
    
    function Scale-Timestamp {
        param([string]$timestamp)
        if ($timestamp -match "(\\d{2}):(\\d{2}):(\\d{2}),(\\d{3})") {
            $totalSeconds = ([int]$Matches[1] * 3600) + ([int]$Matches[2] * 60) + [int]$Matches[3] + ([int]$Matches[4] / 1000.0)
            $scaledSeconds = $totalSeconds * $scaleFactor
            $scaledTimeSpan = [TimeSpan]::FromSeconds($scaledSeconds)
            return "{0:D2}:{1:D2}:{2:D2},{3:D3}" -f $scaledTimeSpan.Hours, $scaledTimeSpan.Minutes, $scaledTimeSpan.Seconds, $scaledTimeSpan.Milliseconds
        }
        return $timestamp
    }
    
    $processedContent = [regex]::Replace($subtitlesContent, $lastTimestampPattern, {
        param($match)
        $scaledStart = Scale-Timestamp $match.Groups[0].Value.Split(' ')[0]
        $scaledEnd = Scale-Timestamp $match.Groups[0].Value.Split(' ')[2]
        return "$scaledStart --> $scaledEnd"
    })
    
    # Backup and save
    Copy-Item $subtitlesPath "$subtitlesPath.backup" -Force
    $processedContent | Set-Content $subtitlesPath -Encoding UTF8 -NoNewline
    Write-Host "[SUCCESS] Subtitles synchronized and saved!"
    
} catch {
    Write-Host "[ERROR] PowerShell error: $($_.Exception.Message)"
    exit 1
}
`;

export const CREATE_VIDEO_PS1 = `
# PowerShell script to create video with Ken Burns effect
# FIX: Escape '$' in template literals to prevent TypeScript from interpreting them.
$ErrorActionPreference = "Stop"

try {
    $basePath = (Get-Location).Path
    Write-Host "[INFO] Working directory: $basePath"
    
    $images = Get-ChildItem -Path (Join-Path $basePath "images") -Include *.png,*.jpg,*.jpeg -Recurse | Sort-Object Name
    if ($images.Count -eq 0) { Write-Host "[ERROR] No images found!"; exit 1 }
    
    $audioFile = Join-Path $basePath "final_audio.wav"
    $audioDurationStr = (& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $audioFile).Trim()
    $audioDuration = [double]::Parse($audioDurationStr, [System.Globalization.CultureInfo]::InvariantCulture)
    
    $durationPerImage = [math]::Round($audioDuration / $images.Count, 3)
    $fps = 25
    
    $ffmpegInputs = @()
    foreach ($img in $images) {
        $ffmpegInputs += "-loop", "1", "-framerate", $fps, "-t", $durationPerImage.ToString([System.Globalization.CultureInfo]::InvariantCulture), "-i", $img.FullName
    }
    
    $filterParts = @()
    $totalFramesPerImage = [int]($durationPerImage * $fps)
    
    for ($i = 0; $i -lt $images.Count; $i++) {
        $inputLabel = "[\$($i):v]"
        $outputLabel = "[f\$($i)]"
        $zoomSpeed = 0.0012
        $maxZoom = 1.25
        $zoomSpeedStr = $zoomSpeed.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $maxZoomStr = $maxZoom.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $kenBurnsFilter = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+$zoomSpeedStr,$maxZoomStr)':d=$totalFramesPerImage:s=1280x720"
        $filterParts += "$inputLabel$kenBurnsFilter$outputLabel"
    }
    
    $concatInputLabels = ""
    for ($i = 0; $i -lt $images.Count; $i++) { $concatInputLabels += "[f\$($i)]" }
    $concatFilter = $concatInputLabels + "concat=n=" + $images.Count + ":v=1:a=0[v1]"
    
    $subtitlesPath = (Join-Path $basePath "subtitles.srt").Replace('\\', '/')
    $subtitlesPathEscaped = $subtitlesPath -replace ':', '\\:'
    $subtitlesFilter = "[v1]subtitles='$subtitlesPathEscaped':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=30,Alignment=2'[v]"
    
    $filterComplex = ($filterParts + $concatFilter + $subtitlesFilter) -join ";"
    
    $audioInputIndex = $images.Count
    
    $videoTitle = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $basePath "get_video_title.ps1")).Trim()
    $outputFile = ($videoTitle -replace '[<>:"/\\\\|?*]', '_').Trim('.', ' ', '_') + ".mp4"
    if ($outputFile.Length -gt 200) { $outputFile = $outputFile.Substring(0, 200) + ".mp4" }
    
    $ffmpegArgs = @("-y") + $ffmpegInputs + @("-filter_complex", $filterComplex, "-i", $audioFile, "-map", "[v]", "-map", "\$($audioInputIndex):a:0", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-shortest", $outputFile)
    
    Write-Host "[INFO] Running FFmpeg to create '$outputFile'..."
    & ffmpeg @ffmpegArgs
    
    if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] FFmpeg failed!"; exit 1 }
    Write-Host "[SUCCESS] Video created successfully: $outputFile"

} catch {
    Write-Host "[ERROR] PowerShell error: \$(\$_.Exception.Message)"
    exit 1
}
`;

export const ASSEMBLE_VIDEO_BAT = `
@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Mystic Narratives Video Assembler
echo ===================================================
echo.

REM --- 1. PRE-FLIGHT CHECKS ---
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg not found! Please install it and add to your PATH.
    pause
    exit /b 1
)
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] PowerShell is not available on this system.
    pause
    exit /b 1
)
if not exist "final_audio.wav" (echo [ERROR] final_audio.wav not found! & pause & exit /b 1)
if not exist "subtitles.srt" (echo [ERROR] subtitles.srt not found! & pause & exit /b 1)
if not exist "images" (echo [ERROR] images folder not found! & pause & exit /b 1)

echo [SUCCESS] All dependencies and files found.
echo.

REM --- 2. SUBTITLE SYNCHRONIZATION ---
echo [INFO] Step 1: Synchronizing subtitles...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync_subtitles.ps1"
if %errorlevel% neq 0 (
    echo [WARNING] Subtitle synchronization failed. Video will be created with original timings.
) else (
    echo [SUCCESS] Subtitles synchronized.
)
echo.

REM --- 3. VIDEO CREATION ---
echo [INFO] Step 2: Creating video with Ken Burns effects...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_video.ps1"
if %errorlevel% neq 0 (
    echo [ERROR] Video creation failed! Check PowerShell output above.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   All tasks completed successfully!
echo ===================================================
echo.
pause
`;

export const UPDATED_PYTHON_ASSEMBLY_SCRIPT = `
import os
import subprocess
import glob
import urllib.request
import re

def download_missing_assets():
    print("--- Checking for missing assets (Music/SFX) ---")
    for folder in ['music', 'sfx']:
        if not os.path.exists(folder): continue
        for txt_file in glob.glob(os.path.join(folder, "[LINK]*.txt")):
            try:
                print(f"Found placeholder: {txt_file}")
                with open(txt_file, 'r', encoding='utf-8', errors='ignore') as f:
                    url = next((line.split("Source URL:", 1)[1].strip() for line in f if "Source URL:" in line), None)
                if url:
                    base_name = os.path.basename(txt_file)
                    clean_name = base_name.replace("[LINK]_", "").rsplit('.', 1)[0] + ".mp3"
                    dest_path = os.path.join(folder, clean_name)
                    print(f"Downloading: {url} -> {clean_name} ...")
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
                        out_file.write(response.read())
                    print("Download successful.")
                    os.remove(txt_file)
            except Exception as e:
                print(f"Failed to download asset from {txt_file}: {e}")
    print("--- Asset check complete ---\\n")

def get_video_title():
    if os.path.exists("VIDEO_TITLE.txt"):
        with open("VIDEO_TITLE.txt", "r", encoding='utf-8') as f:
            return f.read().strip()
    if os.path.exists("youtube_details.txt"):
        with open("youtube_details.txt", "r", encoding='utf-8') as f:
            match = re.search(r"TITLE:\\s*([\\s\\S]*?)(?:\\n----|$)", f.read(), re.MULTILINE)
            if match: return match.group(1).strip()
    return "final_video"

def create_video():
    download_missing_assets()
    
    images = sorted(glob.glob("images/*.png") + glob.glob("images/*.jpg") + glob.glob("images/*.jpeg"))
    if not images:
        print("[ERROR] No images found in images/ folder.")
        return

    try:
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', 'final_audio.wav'], capture_output=True, text=True, check=True)
        audio_duration = float(result.stdout)
        duration_per_image = round(audio_duration / len(images), 3)
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError) as e:
        print(f"[ERROR] Could not get audio duration from final_audio.wav: {e}")
        return

    video_title = get_video_title()
    sanitized_title = re.sub(r'[<>:"/\\\\|?*]', '_', video_title).strip('. _')[:200]
    output_file = f"{sanitized_title}.mp4"

    ffmpeg_inputs = []
    for img in images:
        ffmpeg_inputs.extend(['-loop', '1', '-framerate', '25', '-t', str(duration_per_image), '-i', img])

    filter_complex_parts = []
    for i in range(len(images)):
        filter_complex_parts.append(f"[{i}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0012,1.25)':d={int(duration_per_image * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720[f{i}]")

    concat_inputs = "".join([f"[f{i}]" for i in range(len(images))])
    concat_filter = f"{concat_inputs}concat=n={len(images)}:v=1:a=0[v1]"
    
    subtitles_filter = f"[v1]subtitles=subtitles.srt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=30,Alignment=2'[v]"
    
    filter_complex = ";".join(filter_complex_parts + [concat_filter, subtitles_filter])
    
    cmd = ['ffmpeg', '-y'] + ffmpeg_inputs + [
        '-filter_complex', filter_complex,
        '-i', 'final_audio.wav',
        '-map', '[v]', '-map', f'{len(images)}:a:0',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k',
        '-pix_fmt', 'yuv420p', '-shortest', output_file
    ]
    
    print(f"Running FFmpeg to create '{output_file}'...")
    try:
        subprocess.run(cmd, check=True)
        print(f"\\n[SUCCESS] Video created: {output_file}")
    except subprocess.CalledProcessError as e:
        print(f"\\n[ERROR] FFmpeg failed: {e}")
    except FileNotFoundError:
        print("\\n[ERROR] FFmpeg not found. Please install FFmpeg and add it to your system's PATH.")

if __name__ == '__main__':
    create_video()
`;

export const UPDATED_README_ASSEMBLY = `
# How to Assemble Your Video

This project contains all the necessary files to assemble your final video locally. This gives you more control and allows for higher quality rendering.

## 1. Requirements

- **FFmpeg**: A powerful command-line tool for handling video and audio.
- **PowerShell** (for Windows users): Included by default in modern Windows.
- **Python 3** (optional, but recommended): For the cross-platform 'assemble_locally.py' script.

### Installation

- **Windows**: 'winget install ffmpeg'
- **Mac**: 'brew install ffmpeg'
- **Linux**: 'sudo apt install ffmpeg'

## 2. How to Run

### Recommended Method (All Platforms): Python Script

The Python script ('assemble_locally.py') is the most robust method. It automatically downloads any missing music/SFX files that failed in the browser.

1.  Make sure you have Python 3 installed.
2.  Open your terminal or command prompt in this folder.
3.  Run the script:
    'python assemble_locally.py'

### Windows-Only: Batch Script

If you don't have Python, you can use the '.bat' file on Windows.

1.  Simply double-click 'assemble_video.bat'.
2.  Follow the on-screen instructions.

## 3. What Happens

The script will automatically:
- ✅ **Check for dependencies** like FFmpeg.
- ✅ **Synchronize subtitles** to match the exact audio length.
- ✅ **Combine** the animated images into a video stream.
- ✅ **Add the final audio track** ('final_audio.wav').
- ✅ **Burn in the subtitles** directly onto the video.
- ✅ **Name the final file** based on your 'VIDEO_TITLE.txt'.

The output will be a high-quality MP4 file, ready for upload.
`;
