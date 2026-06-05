from __future__ import annotations

from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .config import BaxterConfig, CONFIG
from .folders import list_files_by_suffix, move_many_to_done, unique_path, validate_folders
from .models import JobResult


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def convert_images_to_pdf(config: BaxterConfig = CONFIG, filenames: list[str] | None = None) -> JobResult:
    folder_error = validate_folders(config)
    if folder_error:
        return folder_error

    if filenames is not None:
        images = [(config.input_dir / fn).resolve() for fn in filenames]
        # Validate they exist and are in input dir
        for img in images:
            try:
                img.relative_to(config.input_dir.resolve())
            except ValueError:
                return JobResult(status="failed", message="Soubor není ve složce Inbox.")
            if not img.is_file():
                return JobResult(status="failed", message=f"Soubor neexistuje: {img.name}")
    else:
        images = list_files_by_suffix(config.input_dir, IMAGE_SUFFIXES)

    if not images:
        return JobResult(
            status="failed",
            message="Ve složce Baxter nejsou žádné JPG nebo PNG obrázky k převodu.",
        )

    output = unique_path(config.input_dir / f"{images[0].stem}.pdf")
    opened: list[Image.Image] = []
    converted: list[Image.Image] = []
    try:
        for image_path in images:
            image = Image.open(image_path)
            opened.append(image)
            if image.mode in ("RGBA", "LA"):
                background = Image.new("RGB", image.size, "white")
                alpha = image.getchannel("A") if image.mode == "RGBA" else image.getchannel("A")
                background.paste(image.convert("RGB"), mask=alpha)
                converted.append(background)
            else:
                converted.append(image.convert("RGB"))

        first, rest = converted[0], converted[1:]
        first.save(output, "PDF", save_all=True, append_images=rest, resolution=100.0)
    except UnidentifiedImageError as exc:
        return JobResult(status="failed", message=f"Obrázek nelze přečíst: {exc}")
    except Exception as exc:
        return JobResult(status="failed", message=f"Převod obrázků do PDF selhal: {exc}")
    finally:
        for image in opened:
            image.close()
        for image in converted:
            image.close()

    moved = move_many_to_done([*images, output], config)
    outputs = [str(path) for path in moved if path.suffix.casefold() == ".pdf"]
    return JobResult(
        status="done",
        message="Obrázky byly převedeny do PDF.",
        outputs=outputs,
        details={"processed": len(images)},
    )
