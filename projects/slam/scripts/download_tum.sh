#!/usr/bin/env bash
set -euo pipefail

sequence="${1:?usage: download_tum.sh xyz|room|freiburg3_long_office_household}"
case "$sequence" in
  xyz|freiburg1_xyz) name="rgbd_dataset_freiburg1_xyz" ;;
  room|freiburg1_room) name="rgbd_dataset_freiburg1_room" ;;
  long_office|freiburg3_long_office_household) name="rgbd_dataset_freiburg3_long_office_household" ;;
  *) echo "unknown sequence: $sequence" >&2; exit 2 ;;
esac

family="${name#rgbd_dataset_}"
family="${family%%_*}"
base="https://cvg.cit.tum.de/rgbd/dataset/${family}"
archive="data/${name}.tgz"
target="data/${name}"
mkdir -p data
if [[ ! -d "$target" ]]; then
  if [[ ! -f "$archive" ]]; then
    echo "Downloading ${name} (TUM official archive)"
    curl -fL --retry 3 --retry-delay 2 -o "$archive" "${base}/${name}.tgz"
  fi
  tar -xzf "$archive" -C data
fi
[[ -f "${target}/rgb.txt" ]] || { echo "invalid dataset: ${target}" >&2; exit 1; }
[[ -f "${target}/depth.txt" ]] || { echo "invalid dataset: ${target}" >&2; exit 1; }
[[ -f "${target}/groundtruth.txt" ]] || { echo "invalid dataset: ${target}" >&2; exit 1; }
echo "Dataset ready: ${target}"
