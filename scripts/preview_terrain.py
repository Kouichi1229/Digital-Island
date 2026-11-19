from pathlib import Path
from PIL import Image, ImageDraw

source = Path("assets/tilesets/terrain/terrain_source.png")
output = Path("assets/tilesets/terrain/terrain_cells_preview.png")

image = Image.open(source).convert("RGB")

width, height = image.size
columns = 8
rows = 8

cell_w = width / columns
cell_h = height / rows

thumb_size = 96
label_height = 22

preview = Image.new(
    "RGB",
    (columns * thumb_size, rows * (thumb_size + label_height)),
    (35, 35, 35)
)

draw = ImageDraw.Draw(preview)

for row in range(rows):
    for col in range(columns):
        left = round(col * cell_w) + 2
        top = round(row * cell_h) + 2
        right = round((col + 1) * cell_w) - 2
        bottom = round((row + 1) * cell_h) - 2

        tile = image.crop((left, top, right, bottom))
        tile = tile.resize(
            (thumb_size, thumb_size),
            Image.Resampling.NEAREST
        )

        x = col * thumb_size
        y = row * (thumb_size + label_height)

        preview.paste(tile, (x, y))
        draw.text(
            (x + 4, y + thumb_size + 3),
            f"R{row + 1} C{col + 1}",
            fill="white"
        )

preview.save(output)

print(f"Source: {image.size}")
print(f"Grid: {columns} x {rows}")
print(f"Preview saved: {output}")
