import json
from pathlib import Path
from PIL import Image

ROOT = Path("assets/creatures/lumi")
RAW = ROOT / "raw"
OUTPUT = ROOT / "frames"
MANIFEST = ROOT / "manifest.json"
PADDING = 8
THRESHOLD = 8

FRAMES = {
    "walk-down": [
        (64, 96, 959, 1007),
        (1088, 16, 1983, 959),
        (2112, 96, 3007, 1007),
        (3136, 16, 4031, 991),
    ],
    "walk-left": [
        (48, 55, 1028, 999),
        (1071, 40, 2050, 1015),
        (2096, 104, 3074, 983),
        (3120, 88, 4095, 1016),
    ],
    "walk-right": [
        (0, 452, 669, 1127),
        (681, 429, 1345, 1128),
        (1364, 484, 2033, 1104),
        (2047, 437, 2712, 1104),
    ],
    "walk-up": [
        (42, 352, 639, 1279),
        (725, 319, 1322, 1290),
        (1408, 351, 2004, 1279),
        (2089, 319, 2687, 1290),
    ],
}

manifest = {
    "character": "Lumi",
    "version": 1,
    "padding": PADDING,
    "alpha_threshold_for_detection": THRESHOLD,
    "frames": {},
}

for direction, boxes in FRAMES.items():
    source_path = RAW / f"{direction}.png"
    output_dir = OUTPUT / direction
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as source:
        source = source.convert("RGBA")
        image_width, image_height = source.size

        for index, (x1, y1, x2, y2) in enumerate(boxes):
            if not (0 <= x1 <= x2 < image_width):
                raise ValueError(f"{direction} frame {index}: invalid x bbox")
            if not (0 <= y1 <= y2 < image_height):
                raise ValueError(f"{direction} frame {index}: invalid y bbox")

            # bbox 座標為包含右下端點
            left = max(0, x1 - PADDING)
            top = max(0, y1 - PADDING)
            right = min(image_width, x2 + PADDING + 1)
            bottom = min(image_height, y2 + PADDING + 1)

            crop = source.crop((left, top, right, bottom))

            filename = f"frame-{index:02d}.png"
            output_path = output_dir / filename
            crop.save(output_path)

            # 檢查輸出尺寸與 Alpha 通道
            with Image.open(output_path) as check:
                if check.mode != "RGBA":
                    raise RuntimeError(f"Invalid mode: {output_path}")
                if check.size != crop.size:
                    raise RuntimeError(f"Invalid size: {output_path}")

            key = f"{direction}/frame-{index:02d}"

            manifest["frames"][key] = {
                "file": str(output_path),
                "index": index,
                "source": str(source_path),
                "source_bbox_inclusive": [x1, y1, x2, y2],
                "crop_rect": [left, top, right, bottom],
                "crop_size": list(crop.size),
                "bbox_offset_in_crop": [
                    x1 - left,
                    y1 - top,
                ],
                "padding": {
                    "left": x1 - left,
                    "top": y1 - top,
                    "right": right - (x2 + 1),
                    "bottom": bottom - (y2 + 1),
                },
            }

            print(
                f"[OK] {key}: "
                f"{crop.width}x{crop.height}"
            )

with MANIFEST.open("w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print("\n===== COMPLETE =====")
print(f"Frames: {len(manifest['frames'])}")
print(f"Manifest: {MANIFEST}")
