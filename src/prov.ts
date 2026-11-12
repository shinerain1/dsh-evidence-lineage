import type { Case } from './store.js'
/** W3C PROV-JSON subset. It serializes assertions, never certifies their truth. */
export function toProv(doc: Case) {
  const entity: Record<string, unknown> = {}
  const wasDerivedFrom: Record<string, unknown> = {}
  const wasInfluencedBy: Record<string, unknown> = {}
  for (const n of doc.nodes) entity['ev:' + n.id] = {
    'prov:label': n.title || n.id, 'ev:sha256': n.sha256, 'ev:sourceId': n.source_id,
    'ev:kind': n.kind, 'ev:claim': n.claim, 'ev:stance': n.stance,
    ...(n.url ? { 'ev:url': n.url } : {}),
  }
  for (const e of doc.edges.filter(e => e.active)) {
    const attrs = { 'ev:basis': e.basis, 'ev:note': e.note, 'ev:semanticVerification': false }
    if (e.relation === 'derivation') wasDerivedFrom['ev:' + e.id] = {
      'prov:generatedEntity': 'ev:' + e.child, 'prov:usedEntity': 'ev:' + e.parent, ...attrs,
    }
    else wasInfluencedBy['ev:' + e.id] = { 'prov:influencee': 'ev:' + e.child, 'prov:influencer': 'ev:' + e.parent, ...attrs }
  }
  return { prefix: { ev: 'https://github.com/shinerain1/dsh-evidence-lineage/ns#' }, entity, wasDerivedFrom, wasInfluencedBy }
}
