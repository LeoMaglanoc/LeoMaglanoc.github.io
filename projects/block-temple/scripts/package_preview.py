from pathlib import Path
# Blender ships Python without Pillow; this script uses the host Python.
from PIL import Image
root=Path(__file__).resolve().parents[1]
out=root.parents[1]/'assets/interactive/block-temple'; out.mkdir(parents=True,exist_ok=True)
Image.open(root/'artifacts/renders/entrance.png').convert('RGB').save(out/'temple-preview.jpg',quality=87)
