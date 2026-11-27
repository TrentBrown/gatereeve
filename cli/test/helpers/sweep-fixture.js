// A complete sweep record for fixed-claim fixtures (issue #144).
export const sweep = (extra = {}) => ({ class: 'Fixture defect class', search: 'rg -n "answer" app/', sites: [{ path: 'app/app.js', line: 1 }],
  fix: 'app/app.js is the single source of truth', test: 'Fixture class-level test', dependents: 'No dependents; checked by search', ...extra });
export const fixed = (findingId, claim = 'Fixed in this revision.', extra = {}) => ({ findingId, claim, disposition: 'fixed', sweep: sweep(extra) });
export const disputed = (findingId, claim = 'Not a defect: intended behavior.') => ({ findingId, claim, disposition: 'disputed' });
