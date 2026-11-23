from PIL import Image
from pathlib import Path

image_path = Path("assets/creatures/lumi/raw/walk-down.png")

image = Image.open(image_path)

print("圖片尺寸：", image.size)
print("圖片格式：", image.format)
print("色彩模式：", image.mode)

if image.mode == "RGBA":
    alpha = image.getchannel("A")

    transparent = sum(
        1 for value in alpha.getdata()
        if value == 0
    )

    print("具有透明背景：是")
    print("完全透明像素：", transparent)
else:
    print("具有透明背景：否")