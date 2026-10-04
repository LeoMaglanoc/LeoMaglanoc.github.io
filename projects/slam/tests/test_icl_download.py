import io
import tarfile
import pytest
from slam_pipeline.scripts.download_icl import archive, disk_guard


def test_disk_guard_preserves_reserve(tmp_path,monkeypatch):
    import slam_pipeline.scripts.download_icl as download
    from collections import namedtuple
    usage=namedtuple('Usage','total used free')
    monkeypatch.setattr(download.shutil,'disk_usage',lambda _:usage(10,9,1))
    with pytest.raises(RuntimeError,match='reserve'):disk_guard(tmp_path)


def test_archive_rejects_parent_traversal(tmp_path,monkeypatch):
    import slam_pipeline.scripts.download_icl as download
    package=tmp_path/'malicious.tar.gz'
    with tarfile.open(package,'w:gz') as tar:
        info=tarfile.TarInfo('../escaped');info.size=3;tar.addfile(info,io.BytesIO(b'bad'))
    monkeypatch.setattr(download,'disk_guard',lambda *args:None)
    with pytest.raises(RuntimeError,match='Unsafe archive'):archive(package.as_uri(),tmp_path/'extract')
    assert not (tmp_path/'escaped').exists()
    assert not (tmp_path/'extract/source.tar.gz').exists()


def test_download_rejects_changed_pinned_bytes(tmp_path,monkeypatch):
    import slam_pipeline.scripts.download_icl as download
    source=tmp_path/'official.bin';source.write_bytes(b'changed')
    destination=tmp_path/'saved.bin'
    monkeypatch.setattr(download,'disk_guard',lambda *args:None)
    monkeypatch.setattr(download,'expected_hash',lambda _: '0'*64)
    with pytest.raises(RuntimeError,match='checksum changed'):
        download.fetch(source.as_uri(),destination)
    assert not destination.exists()
    assert not (tmp_path/'saved.bin.part').exists()


def test_invalid_report_cannot_destroy_last_valid_result(tmp_path):
    import json
    from slam_pipeline.scripts.icl_benchmark import write_json
    path=tmp_path/'result.json'
    write_json(path,{'status':'passed'})
    with pytest.raises(ValueError):write_json(path,{'metric':float('nan')})
    assert json.loads(path.read_text())=={'status':'passed'}
    assert list(tmp_path.iterdir())==[path]
