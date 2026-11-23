from pathlib import Path
from PIL import Image, ImageDraw

source = Path("assets/tilesets/terrain/source_cells")
output = Path("assets/tilesets/terrain/asset_catalog.png")

files = sorted(
    source.glob("*.png"),
    key=lambda p: (
        int(p.stem.split("C")[0][1:]),
        int(p.stem.split("C")[1])
    )
)

cell_size = 144
label_height = 24
columns = 8
rows = 8

catalog = Image.new(
    "RGB",
    (columns * cell_size, rows * (cell_size + label_height)),
    "#263746"
)

draw = ImageDraw.Draw(catalog)

for index, path in enumerate(files):
    image = Image.open(path).convert("RGBA")
    image.thumbnail((cell_size - 12, cell_size - 12))

    x = (index % columns) * cell_size
    y = (index // columns) * (cell_size + label_height)

    background = Image.new("RGBA", (cell_size, cell_size), "#405568")
    px = (cell_size - image.width) // 2
    py = (cell_size - image.height) // 2
    background.alpha_composite(image, (px, py))

    catalog.paste(background.convert("RGB"), (x, y))
    draw.text((x + 8, y + cell_size + 4), path.stem, fill="white")

catalog.save(output)
print(f"素材數量：{len(files)}")
print(f"總覽尺寸：{catalog.size}")
print(f"輸出位置：{output}")
