"""Independent reverse traversal and complete input-fact parity, before model calls."""
import hashlib, json
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
out = repo / 'docs/results/origins'
load = lambda path: json.loads(path.read_text(encoding='utf-8'))
manifest = load(out/'manifest.json')
gold = {c['id']: c for c in load(out/'gold.json')}
corpus = {c['id']: c for c in load(out/'corpus.json')}
packets = 0
max_depth = {}
for seed in (107, 211, 307):
    for arm in ('raw', 'text-dedup', 'lineage'):
        packet = load(out/f'{arm}-{seed}-input.json')
        assert len(packet['cases']) == 6
        for c in packet['cases']:
            e, ref, g = c['evidence'], corpus[c['id']], gold[c['id']]
            expected = {n['id']: n for n in ref['nodes']}
            index = {n['id']: n for n in e['material_index']}
            assert set(index) == set(expected)
            assert e['links'] == ref['links']
            for k, n in index.items():
                assert n == {f: expected[k][f] for f in ('id','source_id','url')}
            texts = {}
            for n in e['items']:
                texts[n['id']] = n['text']
                for alias in n.get('aliases', []):
                    texts[alias if isinstance(alias,str) else alias['id']] = n['text']
            assert texts == {k:n['text'] for k,n in expected.items()}
            parents = {k:[] for k in index}
            for edge in e['links']:
                if edge['relation']=='derivation': parents[edge['child']].append(edge['parent'])
            def roots(k, seen=()):
                assert k not in seen
                if not parents[k]: return {index[k]['source_id']}, 0
                found, depth = set(), 0
                for parent in parents[k]:
                    r,d = roots(parent, seen+(k,)); found |= r; depth=max(depth,d+1)
                return found, depth
            all_roots = set()
            for k in index:
                r,d=roots(k);all_roots |= r;max_depth[c['id']]=max(max_depth.get(c['id'],0),d)
            assert len(all_roots)==g['recorded_origin_count']
            assert set(c['query_ids']) == {q['material_id'] for q in g['queries']}
            for q in g['queries']: assert roots(q['material_id'])[0] == set(q['origins'])
            if arm=='lineage':
                assert e['recorded_origin_count']==len(all_roots)
                for n in e['items']: assert set(n['origins'])==roots(n['id'])[0]
        packets += 1
for name, expected in manifest['hashes'].items():
    assert hashlib.sha256((repo/name).read_bytes()).hexdigest()==expected, name
result={'valid':True,'packets':packets,'unique_cases':6,'materials':sum(len(c['nodes']) for c in corpus.values()),'queries':24,'all_texts_ids_urls_and_links_preserved':True,'independent_python_oracle_matches':True,'max_derivation_depth':max_depth,'frozen_code_unchanged':True}
(out/'input-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
