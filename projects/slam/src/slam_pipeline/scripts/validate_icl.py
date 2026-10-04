"""Acceptance gate for complete ICL results before publishing assets."""
import argparse
import json
from pathlib import Path
import numpy as np
from ..dataset.icl_nuim import COUNTS
from ..evaluation.surface import validate_se3


def validate(root):
    summary=json.loads((root/'summary.json').read_text())
    if not summary['complete'] or {r['sequence'] for r in summary['sequences']} != set(COUNTS):
        raise ValueError('All four sequences must have successful complete results')
    for result in summary['sequences']:
        name=result['sequence'];folder=root/name
        if result['status']!='passed' or not result['gt_pose_validation']['passed']:
            raise ValueError(f'{name}: GT pose preservation failed')
        if result['provenance']['estimated_GT_odometry_messages'] != 0:
            raise ValueError(f'{name}: GT leaked into estimated odometry')
        validate_se3(result['trajectory']['alignment_se3'])
        if not json.loads((folder/'trajectory/evo_crosscheck.json').read_text())['within_1e-5_tolerance']:
            raise ValueError(f'{name}: evo cross-check failed')
        for condition in ('tsdf_clean_gt','tsdf_clean_gt_full','tsdf_gt','tsdf_estimated','rtab_gt','rtab_estimated'):
            metric=result['conditions'][condition]
            if metric['distance_method']!='point_to_triangle' or metric['seed'] != 2026:
                raise ValueError(f'{name}: wrong geometry protocol')
            for direction in ('accuracy','completeness'):
                if not all(np.isfinite(v) and v>=0 for v in metric[direction].values()):
                    raise ValueError(f'{name}: invalid surface distances')
            for threshold in metric['f_scores'].values():
                if not all(0<=v<=1 for v in threshold.values()):raise ValueError(f'{name}: invalid F-score')
        sources=[]
        for condition in ('tsdf_gt','tsdf_estimated','rtab_gt','rtab_estimated'):
            sources.append(json.loads((folder/condition/'stats.json').read_text())['source_frame_ids'])
        if not all(ids==sources[0] for ids in sources):raise ValueError(f'{name}: mapper frame coverage differs')
    cloud=json.loads((root/'lr_kt0/native_source_cloud_validation.json').read_text())
    if not cloud['passed'] or cloud['source_frame_ids']!=json.loads((root/'lr_kt0/frame_ids.json').read_text()):
        raise ValueError('Native depth-cloud coordinates failed independent unprojection check')
    print('ICL acceptance passed: four sequences, GT isolation, common frames, SE(3), evo, surface metrics')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path,nargs='?',default=Path('outputs/icl_nuim'))
    validate(p.parse_args().output)

if __name__=='__main__':main()
