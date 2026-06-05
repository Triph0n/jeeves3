from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .config import BaxterConfig, CONFIG
from .folders import list_files_by_suffix, move_many_to_done, unique_path, validate_folders
from .models import JobResult


VIDEO_SUFFIXES = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}


def convert_videos_to_mp3(config: BaxterConfig = CONFIG, filenames: list[str] | None = None) -> JobResult:
    folder_error = validate_folders(config)
    if folder_error:
        return folder_error

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return JobResult(
            status="missing_config",
            message="FFmpeg není dostupný. Nainstaluj FFmpeg nebo ho přidej do PATH.",
        )

    if filenames is not None:
        videos = [(config.input_dir / fn).resolve() for fn in filenames]
        # Validate they exist and are in input dir
        for vid in videos:
            try:
                vid.relative_to(config.input_dir.resolve())
            except ValueError:
                return JobResult(status="failed", message="Soubor není ve složce Inbox.")
            if not vid.is_file():
                return JobResult(status="failed", message=f"Soubor neexistuje: {vid.name}")
    else:
        videos = list_files_by_suffix(config.input_dir, VIDEO_SUFFIXES)

    if not videos:
        return JobResult(
            status="failed",
            message="Ve složce Baxter nejsou žádné podporované video soubory.",
        )

    outputs: list[Path] = []
    processed_inputs: list[Path] = []
    for video in videos:
        output = unique_path(config.input_dir / f"{video.stem}.mp3")
        command = [
            ffmpeg,
            "-y",
            "-i",
            str(video),
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            config.ffmpeg_bitrate,
            str(output),
        ]
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if completed.returncode != 0:
            if output.exists():
                output.unlink()
            return JobResult(
                status="failed",
                message=f"Převod videa do MP3 selhal u souboru {video.name}.",
                details={"stderr": completed.stderr[-2000:]},
            )
        processed_inputs.append(video)
        outputs.append(output)

    moved = move_many_to_done([*processed_inputs, *outputs], config)
    done_outputs = [str(path) for path in moved if path.suffix.casefold() == ".mp3"]
    return JobResult(
        status="done",
        message="Audio bylo převedeno do MP3.",
        outputs=done_outputs,
        details={"processed": len(outputs)},
    )
