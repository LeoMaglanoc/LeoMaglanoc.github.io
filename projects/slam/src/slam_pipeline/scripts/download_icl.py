"""Official ICL downloads with bounded extraction, checksums and disk reserve."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
import urllib.request
from ..dataset.icl_nuim import COUNTS

BASE = 'https://www.doc.ic.ac.uk/~ahanda/'
RESERVE = 5 * 1024**3
MAX_EXPANSION = 4 * 1024**3


def disk_guard(path, required=0):
    path = Path(path)
    path.mkdir(parents=True,exist_ok=True)
    free = shutil.disk_usage(path).free
    if free < RESERVE + required:
        raise RuntimeError(f'Insufficient disk space: {free/1024**3:.1f} GiB free; must preserve 5 GiB reserve plus {required/1024**3:.1f} GiB work space')


def expected_hash(url):
    manifest=Path(__file__).resolve().parents[3]/"config/icl_downloads.json"
    return json.loads(manifest.read_text()).get(url) if manifest.is_file() else None


def fetch(url, path):
    disk_guard(path.parent)
    digest = hashlib.sha256()
    temporary = path.with_suffix(path.suffix+'.part')
    try:
        with urllib.request.urlopen(url,timeout=120) as source, temporary.open('wb') as dest:
            length = int(source.headers.get('Content-Length',0))
            disk_guard(path.parent,length)
            while chunk := source.read(1024*1024):
                disk_guard(path.parent,len(chunk))
                dest.write(chunk);digest.update(chunk)
        expected=expected_hash(url)
        if expected is not None and digest.hexdigest()!=expected:
            raise RuntimeError(f"Official download checksum changed: {url}")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return {'url':url,'sha256':digest.hexdigest(),'bytes':path.stat().st_size}


def archive(url, destination):
    destination.mkdir(parents=True,exist_ok=True)
    path = destination/'source.tar.gz'
    # Allow one full sequence's expansion before beginning the download.
    disk_guard(destination, MAX_EXPANSION)
    try:
        record = fetch(url,path)
        with tarfile.open(path) as tar:
            members = tar.getmembers()
            expanded = sum(m.size for m in members)
            if expanded > MAX_EXPANSION:
                raise RuntimeError('Archive exceeds bounded extraction budget')
            disk_guard(destination,expanded)
            for member in members:
                target = (destination/member.name).resolve()
                if not target.is_relative_to(destination.resolve()) or not (member.isfile() or member.isdir()):
                    raise RuntimeError(f'Unsafe archive member: {member.name}')
                disk_guard(destination,member.size)
                tar.extract(member,destination)
        record['expanded_bytes'] = expanded
        return record
    finally:
        path.unlink(missing_ok=True)


def download(sequence, data_root):
    if sequence not in COUNTS:
        raise ValueError(sequence)
    data_root = Path(data_root)
    root = data_root/sequence
    records = {}
    reference = data_root/'reference'
    if not (reference/'living-room.obj').is_file():
        records['reference'] = archive(BASE+'VaFRIC/living_room_obj_mtl.tar.gz',reference)
        (reference/'download.json').write_text(json.dumps(records['reference'],indent=2)+'\n')
    records['reference'] = json.loads((reference/'download.json').read_text())
    expected=expected_hash(records['reference']['url'])
    if expected is not None and records['reference']['sha256']!=expected:
        raise RuntimeError('Cached reference hash does not match pinned manifest')
    index = sequence[-1]
    for condition in ('clean','noisy'):
        folder = root/condition
        marker = folder/'download.json'
        if marker.is_file():
            records[condition] = json.loads(marker.read_text())
            expected=expected_hash(records[condition]['url'])
            if expected is not None and records[condition]['sha256']!=expected:
                raise RuntimeError('Cached archive hash does not match pinned manifest')
            continue
        records[condition] = archive(BASE+f'living_room_traj{index}{"n" if condition=="noisy" else ""}_frei_png.tar.gz',folder)
        marker.write_text(json.dumps(records[condition],indent=2)+'\n')
    for name,url in [('global.gt.sim',BASE+f'VaFRIC/livingRoom{index}n.gt.sim'),
                     ('groundtruth.txt',BASE+f'VaFRIC/livingRoom{index}.gt.freiburg')]:
        records[name] = fetch(url,root/name)
    (root/'downloads.json').write_text(json.dumps(records,indent=2)+'\n')
    print(f'Downloaded {sequence}; {shutil.disk_usage(data_root).free/1024**3:.1f} GiB free',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sequence',choices=list(COUNTS))
    parser.add_argument('--data-root',type=Path,default=Path('data/icl_nuim'))
    args=parser.parse_args();download(args.sequence,args.data_root)

if __name__=='__main__':main()
