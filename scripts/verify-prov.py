"""Optional interoperability check. Runtime plugin does not need Python."""
import json
import sys
from pathlib import Path
import prov
from prov.model import ProvDocument

location = json.loads(Path('.verification/dsh-host-location.json').read_text(encoding='utf-8'))
bundle = json.loads(Path(location['bundle']).read_text(encoding='utf-8'))
document = ProvDocument.deserialize(content=json.dumps(bundle['prov']), format='json')
roundtrip = ProvDocument.deserialize(content=document.serialize(format='json'), format='json')
assert roundtrip == document
result = {'library': 'prov', 'version': prov.__version__, 'records': len(document.get_records()), 'roundtrip': True,
          'scope': 'PROV-JSON structure/roundtrip only; not a semantic validity or truth proof'}
Path('docs/results/prov-interop.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
