@echo off
REM ============================================
REM CRITICAL: Keep window open on any error
REM ============================================
if not "%1"=="KEEPOPEN" (
    cmd /k "%~f0" KEEPOPEN
    exit /b
)

setlocal enabledelayedexpansion

echo ===================================================
echo Chapter-Based Video Assembly (High Quality + SFX)
echo ===================================================
echo.
echo [INFO] Script started at: %DATE% %TIME%
echo [INFO] Working directory: %CD%
echo [INFO] If you see this message, script is running!
echo.

REM --- AUTO-DETECT FFMPEG ---
set "FFMPEG_EXEC=ffmpeg"
set "FFPROBE_EXEC=ffprobe"

where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Found FFmpeg in system PATH.
    goto :check_dependencies_done
)

if exist "ffmpeg.exe" (
    set "FFMPEG_EXEC=ffmpeg.exe"
    set "FFPROBE_EXEC=ffprobe.exe"
    echo [INFO] Found FFmpeg in current directory.
    goto :check_dependencies_done
)

REM Common installation paths
if exist "C:\ffmpeg\bin\ffmpeg.exe" (
    set "FFMPEG_EXEC=C:\ffmpeg\bin\ffmpeg.exe"
    set "FFPROBE_EXEC=C:\ffmpeg\bin\ffprobe.exe"
    echo [INFO] Found FFmpeg in C:\ffmpeg\bin
    goto :check_dependencies_done
)

echo [ERROR] FFmpeg not found! 
echo Please install FFmpeg and add to PATH, or copy ffmpeg.exe and ffprobe.exe to this folder.
pause
exit /b 1

:check_dependencies_done

REM Check PowerShell
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] PowerShell not found.
    pause
    exit /b 1
)

REM Create temp folder
mkdir temp_videos 2>nul

REM Test FFmpeg with a simple command
echo [DEBUG] Testing FFmpeg...
"!FFMPEG_EXEC!" -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg test failed! Cannot execute FFmpeg.
    pause
    exit /b 1
)
echo [SUCCESS] FFmpeg is working.
echo.

REM Check project structure
if not exist "chapters" (
    echo [ERROR] 'chapters' folder not found! Make sure you're running this from the project root.
    pause
    exit /b 1
)
echo [SUCCESS] Chapters folder found.
echo.

REM Process each chapter
for /L %%i in (1,1,8) do (
    set "chapter_num=0%%i"
    set "chapter_num=!chapter_num:~-2!"
    set "chapter_dir=chapters\chapter_!chapter_num!"
    
    echo.
    echo [INFO] Processing Chapter !chapter_num!...
    
    if not exist "!chapter_dir!" (
        echo [WARNING] Chapter !chapter_num! not found, skipping...
        goto :skip_chapter
    )
    
    if not exist "!chapter_dir!\metadata.json" (
        echo [ERROR] Metadata missing for chapter !chapter_num!
        goto :skip_chapter
    )
    
    set "img_count=0"
    for %%f in ("!chapter_dir!\images\*.png") do set /a img_count+=1
    
    if !img_count! equ 0 (
        echo [WARNING] No images found for chapter !chapter_num!
        goto :skip_chapter
    )
    
    REM Get audio duration using ffprobe
    set "duration="
    for /f "usebackq tokens=*" %%d in (`"!FFPROBE_EXEC!" -v error -show_entries format^=duration -of default^=noprint_wrappers^=1:nokey^=1 "!chapter_dir!\audio.wav" 2^>nul`) do set "duration=%%d"
    
    if not defined duration (
        echo [WARNING] Could not determine audio duration. Skipping chapter.
        goto :skip_chapter
    )

    REM Calculate image duration using PowerShell (with proper escaping)
    powershell -NoProfile -Command "$d = [math]::Round([double]!duration! / [int]!img_count!, 2); if ($d -lt 2) { $d = 2 }; if ($d -gt 20) { $d = 20 }; Write-Output $d" > temp_img_dur.txt
    set /p img_duration=<temp_img_dur.txt
    del temp_img_dur.txt
    
    echo [INFO] Chapter duration: !duration!s, Image duration: !img_duration!s each
    
    (for %%f in ("!chapter_dir!\images\*.png") do (
        echo file '%%f'
        echo duration !img_duration!
    )) > temp_concat_!chapter_num!.txt
    
    set "filter_complex=[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v]"
    set "inputs=-f concat -safe 0 -i temp_concat_!chapter_num!.txt -i "!chapter_dir!\audio.wav""
    set "maps=-map [v] -map 1:a"
    
    set "sfx_count=0"
    for %%f in ("!chapter_dir!\sfx\*.wav") do set /a sfx_count+=1
    
    if !sfx_count! gtr 0 (
        echo [INFO] Found !sfx_count! SFX files...
        
        set "sfx_inputs="
        set "sfx_input_count=2"
        set "sfx_filter="
        
        for %%f in ("!chapter_dir!\sfx\*.wav") do (
            set "sfx_inputs=!sfx_inputs! -i "%%f""
            set /a sfx_input_count+=1
        )
        
        if exist "!chapter_dir!\metadata.json" (
            REM Use PowerShell script file to avoid brace escaping issues
            echo $metadata = Get-Content '!chapter_dir!\metadata.json' -Raw ^| ConvertFrom-Json; > temp_ps_script.ps1
            echo $sfxIndex = 0; >> temp_ps_script.ps1
            echo $sfxFiles = Get-ChildItem '!chapter_dir!\sfx\*.wav' ^| Sort-Object Name; >> temp_ps_script.ps1
            echo foreach ($timing in $metadata.sfxTimings) { >> temp_ps_script.ps1
            echo     if ($sfxIndex -lt $sfxFiles.Count) { >> temp_ps_script.ps1
            echo         $delayMs = [math]::Round($timing.startTime * 1000); >> temp_ps_script.ps1
            echo         $volume = if ($timing.volume) { $timing.volume } else { 0.3 }; >> temp_ps_script.ps1
            echo         Write-Output "[2:a]adelay=$delayMs^|$delayMs,volume=$volume[sfx$sfxIndex a]"; >> temp_ps_script.ps1
            echo         $sfxIndex++; >> temp_ps_script.ps1
            echo     } >> temp_ps_script.ps1
            echo } >> temp_ps_script.ps1
            powershell -NoProfile -ExecutionPolicy Bypass -File temp_ps_script.ps1 > temp_sfx_filters.txt 2>nul
            del temp_ps_script.ps1 2>nul
            
            if exist temp_sfx_filters.txt (
                set "first_sfx=1"
                for /f "usebackq tokens=*" %%a in (temp_sfx_filters.txt) do (
                    if !first_sfx! equ 1 (
                        set "sfx_filter=%%a"
                        set "first_sfx=0"
                    ) else (
                        set "sfx_filter=!sfx_filter!;%%a"
                    )
                )
            )
            del temp_sfx_filters.txt 2>nul
        )
        
        if !sfx_count! equ 1 (
            set "inputs=!inputs! !sfx_inputs!"
            if defined sfx_filter (
                set "filter_complex=!filter_complex!;!sfx_filter!;[1:a][sfx0a]amix=inputs=2:duration=first[a]"
            ) else (
                set "filter_complex=!filter_complex!;[1:a][2:a]amix=inputs=2:duration=first[a]"
            )
        ) else if !sfx_count! gtr 1 (
            set "inputs=!inputs! !sfx_inputs!"
            if defined sfx_filter (
                set "mix_inputs=[1:a]"
                for /L %%n in (0,1,!sfx_count!) do (
                    if %%n lss !sfx_count! set "mix_inputs=!mix_inputs![sfx%%na]"
                )
                set /a total_inputs=!sfx_count!+1
                set "filter_complex=!filter_complex!;!sfx_filter!;!mix_inputs!amix=inputs=!total_inputs!:duration=first[a]"
            ) else (
                set "amix_inputs=!sfx_input_count!"
                for /L %%n in (1,1,!sfx_count!) do (
                    set "filter_complex=!filter_complex![%%n:a]"
                )
                set "filter_complex=!filter_complex!amix=inputs=!amix_inputs!:duration=first[a]"
            )
        )
        set "maps=-map [v] -map [a]"
    ) else (
        set "filter_complex=!filter_complex!;[1:a]acopy[a]"
        set "maps=-map [v] -map [a]"
    )
    
    REM Track which audio output we're using
    set "audio_out=[a]"
    
    if exist "!chapter_dir!\music.wav" (
        echo [INFO] Adding music...
        set "inputs=!inputs! -i "!chapter_dir!\music.wav""
        set "filter_complex=!filter_complex!;[a]amix=inputs=2:duration=first:weights=1 0.3[final_audio]"
        set "audio_out=[final_audio]"
    )
    
    REM TEMPORARY: Skip subtitles for debugging - uncomment below to enable
    REM Check if subtitles file exists
    if not exist "!chapter_dir!\subtitles.srt" (
        echo [WARNING] Subtitles file not found for chapter !chapter_num!, skipping subtitles...
        set "maps=-map [v] -map !audio_out!"
    ) else (
        echo [INFO] Subtitles found, but temporarily DISABLED for debugging...
        echo [INFO] To enable subtitles, uncomment the subtitle filter code in bat file.
        set "maps=-map [v] -map !audio_out!"
        
        REM UNCOMMENT BELOW TO ENABLE SUBTITLES:
        REM echo [INFO] Adding subtitles for chapter !chapter_num!...
        REM set "subtitle_path=%CD%\!chapter_dir!\subtitles.srt"
        REM set "subtitle_path=!subtitle_path:\=/!"
        REM for /f "tokens=1* delims=:" %%a in ("!subtitle_path!") do (
        REM     if not "%%b"=="" set "subtitle_path=%%a\:/%%b"
        REM )
        REM set "filter_complex=!filter_complex!;[v]subtitles='!subtitle_path!':charenc=UTF-8:force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Bold=1'[vout]"
        REM set "maps=-map [vout] -map !audio_out!"
    )
    
    echo [DEBUG] Filter complex length: !filter_complex:~0,200!...
    echo [DEBUG] Maps: !maps!
    echo [DEBUG] Starting FFmpeg for chapter !chapter_num!...
    
    "!FFMPEG_EXEC!" -y !inputs! ^
        -filter_complex "!filter_complex!" ^
        !maps! ^
        -c:v libx264 -preset medium -crf 20 ^
        -c:a aac -b:a 192k ^
        -shortest ^
        temp_videos\chapter_!chapter_num!.mp4
    
    set "ffmpeg_exit=!errorlevel!"
    if !ffmpeg_exit! neq 0 (
        echo.
        echo [ERROR] ==========================================
        echo [ERROR] Failed to process chapter !chapter_num!
        echo [ERROR] FFmpeg exit code: !ffmpeg_exit!
        echo [ERROR] ==========================================
        echo.
        echo [DEBUG] Filter complex was:
        echo !filter_complex!
        echo.
        pause
    ) else (
        echo [SUCCESS] Chapter !chapter_num! complete
    )
    
    :skip_chapter
)

echo.
echo [INFO] Concatenating chapters...

(for /L %%i in (1,1,8) do (
    set "chapter_num=0%%i"
    set "chapter_num=!chapter_num:~-2!"
    if exist "temp_videos\chapter_!chapter_num!.mp4" (
        echo file 'temp_videos/chapter_!chapter_num!.mp4'
    )
)) > final_concat.txt

"!FFMPEG_EXEC!" -y -f concat -safe 0 -i final_concat.txt -c copy final_video.mp4

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Video created: final_video.mp4
    echo.
) else (
    echo [ERROR] Failed to create final video
    goto :error
)

echo [INFO] Cleaning up...
rmdir /s /q temp_videos 2>nul
del temp_concat_*.txt 2>nul
del final_concat.txt 2>nul

echo.
echo Done!
pause
exit /b 0

:error
echo.
echo ==========================================
echo [FATAL ERROR] Video assembly failed!
echo ==========================================
echo.
echo Please review the error messages above.
echo.
echo Common issues:
echo 1. Missing FFmpeg or FFmpeg not in PATH
echo 2. Missing chapter files (audio.wav, images, etc.)
echo 3. Corrupted audio/image files
echo 4. Insufficient disk space
echo.
pause
exit /b 1
