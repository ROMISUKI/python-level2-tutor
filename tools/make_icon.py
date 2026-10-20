"""Generate the Windows icon for Python 二级通关."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def gradient(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    top = (99, 102, 241)
    bottom = (6, 182, 212)
    pixels = image.load()
    for y in range(size):
        ratio = y / max(1, size - 1)
        color = tuple(int(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.24), fill=255)
    image.putalpha(mask)
    return image


def main() -> None:
    size = 512
    image = gradient(size)
    draw = ImageDraw.Draw(image)
    font = None
    for candidate in (
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\msyhbd.ttc",
    ):
        if Path(candidate).exists():
            font = ImageFont.truetype(candidate, int(size * 0.44))
            break
    if font is None:
        font = ImageFont.load_default()
    text = "Py"
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    draw.text(
        ((size - width) / 2 - box[0], (size - height) / 2 - box[1] - size * 0.02),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
    target = Path(__file__).resolve().parent.parent / "assets"
    target.mkdir(parents=True, exist_ok=True)
    png_path = target / "app.png"
    image.save(png_path)
    icon_path = target / "app.ico"
    image.save(
        icon_path,
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )
    print(png_path, icon_path)


if __name__ == "__main__":
    main()
