import json,hashlib
from pathlib import Path
repo=Path(__file__).resolve().parents[2];out=repo/'docs/results/trace-query';old=repo/'docs/results/origins'
load=lambda p:json.loads(p.read_text(encoding='utf-8'))
manifest=load(out/'manifest.json');prior=load(old/'manifest.json');gold={c['id']:c for c in load(out/'gold.json')}
assert load(out/'corpus.json')==load(old/'corpus.json')
assert load(out/'gold.json')==load(old/'gold.json')
rows=[]
for seed in (107,211,307):
    for arm in ('raw','lineage','trace'):
        packet=load(out/f'{arm}-{seed}-input.json')
        if arm!='trace':assert manifest['packet_hashes'][f'{arm}-{seed}']==prior['packet_hashes'][f'{arm}-{seed}']
        else:
            for c in packet['cases']:
                g=gold[c['id']];e=c['evidence'];assert e['complete'] and e['next_offset'] is None
                assert e['recorded_origin_count']==g['recorded_origin_count'] and e['independence']=='unknown'
                expected=sorted((q['material_id'],s) for q in g['queries'] for s in q['origins'])
                actual=sorted((p['evidence_id'],p['source_id']) for p in e['entries'])
                assert expected==actual
        rows.append({'seed':seed,'arm':arm,'verified':True,'bytes':manifest['packet_hashes'][f'{arm}-{seed}']['bytes']})
for f,h in manifest['hashes'].items():assert hashlib.sha256((repo/f).read_bytes()).hexdigest()==h
result={'valid':True,'all_baseline_inputs_unchanged':True,'gold_and_corpus_unchanged':True,'trace_memberships_exact':True,'frozen_files_unchanged':True,'rows':rows}
(out/'input-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
