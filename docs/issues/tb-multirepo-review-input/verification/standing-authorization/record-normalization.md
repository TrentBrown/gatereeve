# Coordinator record normalization

The installed rc.16 advisory classifier rejected the prior schema4 packet's two optional diagnostic GitHub-reported SHA fields, although formal packet validation had accepted it. Exact original packet bytes are retained as pr-84/attempts/formal-pr84-17/boundary-before-d11.txt and in prior Git history. The active packet was normalized to its declared fields; PR identity, reviewed SHA, verdicts and evidence hashes remain unchanged. It will be replaced by the new formal18 packet after review.

New mechanical JSON results are wrapped in the existing feature-verification envelope with their complete original values under payload. No validator, core gate, admission rule or source containment was relaxed. The original preflight failure is retained.
