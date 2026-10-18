from pathlib import Path
import subprocess, sys
from prepare_reference import prepare

root = Path(__file__).resolve().parents[1]
source = prepare()
subprocess.run(
    [
        sys.executable,
        str(root / "tools/reference.py"),
        "--source",
        str(source),
        "--out",
        str(root / "results"),
        "--episodes",
        "100",
    ],
    check=True,
)
subprocess.run([sys.executable, str(root / "tools/export_models.py")], check=True)
(root / "requirements.lock").write_text(
    subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
)
