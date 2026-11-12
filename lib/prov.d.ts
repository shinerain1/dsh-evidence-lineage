import type { Case } from './store.js';
/** W3C PROV-JSON subset. It serializes assertions, never certifies their truth. */
export declare function toProv(doc: Case): {
    prefix: {
        ev: string;
    };
    entity: Record<string, unknown>;
    wasDerivedFrom: Record<string, unknown>;
    wasInfluencedBy: Record<string, unknown>;
};
