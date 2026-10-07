"""Read-only verification of the local continuation archive and hashes."""

from common import *
import tarfile, hashlib


def main():
    record = json.loads((PROJECT / "checkpoint-record.json").read_text())
    path = Path(record["path"])
    assert sha(path) == record["sha256"]
    with tarfile.open(path, "r:gz") as archive:
        manifest = json.load(
            archive.extractfile("artifacts/continuation-manifest.json")
        )
        for entry in manifest["files"]:
            h = hashlib.sha256()
            f = archive.extractfile(entry["path"])
            size = 0
            for block in iter(lambda: f.read(1024 * 1024), b""):
                h.update(block)
                size += len(block)
            assert h.hexdigest() == entry["sha256"] and size == entry["bytes"], entry[
                "path"
            ]
    print(
        "PASS: continuation archive SHA-256 and",
        len(manifest["files"]),
        "internal file hashes",
    )


if __name__ == "__main__":
    main()
