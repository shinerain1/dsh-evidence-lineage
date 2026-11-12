"""Score model final answers against graph inputs, without production ancestry or scorer."""
import json
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
out = repo/'docs/results/trace-query'
load = lambda p: json.loads(p.read_text(encoding='utf-8'))
corpus = {c['id']:c for c in load(out/'corpus.json')}
report = load(out/'results.json')
rows=[]
for run in report['runs']:
    final=load(out/(run['id']+'-final.json'))
    if (final.get('reason') or {}).get('kind')!='completed' or run['protocol_errors'] or run['parse_error']:
        rows.append({'id':run['id'],'complete':False});continue
    text=final['text'].strip()
    if text.startswith('```'):text='\n'.join(text.splitlines()[1:-1])
    answers=json.loads(text)['cases'];cases=[]
    for scored in run['rows']:
        c=corpus[scored['id']];nodes={n['id']:n for n in c['nodes']}
        def roots(k):
            ps=[e['parent'] for e in c['links'] if e['child']==k and e['relation']=='derivation']
            return set().union(*(roots(p) for p in ps)) if ps else {nodes[k]['source_id']}
        count=len(set().union(*(roots(k) for k in nodes)))
        found=[a for a in answers if a['id']==c['id']];assert len(found)==1
        a=found[0];count_ok=a['recorded_origin_count']==count
        qs=[]
        for k in c['query_ids']:
            predicted=[q for q in a['queries'] if q['material_id']==k]
            ok=len(predicted)==1 and sorted(predicted[0]['origins'])==sorted(roots(k))
            assert ok==next(q for q in scored['queries'] if q['material_id']==k)['correct']
            qs.append(ok)
        correct=count_ok and all(qs) and a['independence']=='unknown'
        assert correct==scored['correct'] and count_ok==scored['count_correct']
        cases.append({'id':c['id'],'count_correct':count_ok,'queries_correct':sum(qs),'all_correct':correct})
    rows.append({'id':run['id'],'complete':True,'cases':cases})
result={'valid':True,'checked_runs':len(rows),'completed_runs':sum(r['complete'] for r in rows),'unique_cases':6,'independent_scorer_matches':True,'rows':rows}
(out/'score-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='rows'}))
