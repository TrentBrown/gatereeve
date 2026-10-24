# Packet context normalization

The original provider context is retained in context.json. For this closed PR, it includes githubReportedHeadSha/githubReportedBaseSha diagnostic metadata in addition to the authoritative remote source/base fields. The installed protocol core pins the nine authoritative pullRequest fields and its modular packet validator requires exactly that object. The Python validator also compares the supplied context object literally.

The first validation rejected an eleven-field provider context paired with the nine-field core packet. The validation context is now derived from the actual core-pinned attempt, with a mechanical assertion that only those two provider-report diagnostics differ. All repository, number, URL, state, draft, branch and authoritative SHA fields match. Original provider diagnostics remain retained; source synchronization uses the original provider context. No core guard, hash, gate, source pin or authority requirement was changed.
