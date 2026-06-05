from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


POINTS_PER_MM = 72 / 25.4


@dataclass(frozen=True)
class BaxterConfig:
    base_dir: Path
    input_dir: Path
    done_dir: Path
    error_dir: Path
    config_dir: Path
    signature_path: Path
    signature_width_mm: float = 45.0
    signature_auto_offset_up_mm: float = 12.0
    ffmpeg_bitrate: str = "192k"


def default_config() -> BaxterConfig:
    base = Path.home() / "Desktop" / "Baxter"
    return BaxterConfig(
        base_dir=base,
        input_dir=base,
        done_dir=base / "Hotovo",
        error_dir=base / "Chyba",
        config_dir=base / "Config",
        signature_path=base / "Config" / "signature.png",
    )


CONFIG = default_config()


def resolve_signature_path(config: BaxterConfig = CONFIG) -> Path:
    if config.signature_path.is_file():
        return config.signature_path
    if config.config_dir.is_dir():
        candidates = sorted(config.config_dir.glob("*.png"), key=lambda path: path.name.casefold())
        if candidates:
            return candidates[0]
    return config.signature_path
