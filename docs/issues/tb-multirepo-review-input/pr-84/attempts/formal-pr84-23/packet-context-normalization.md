# Packet context correction

The initial packet writer incorrectly removed githubReportedHeadSha and githubReportedBaseSha from the provider context. Validation correctly rejected that mismatch. Inspection of the actual core-pinned formal23 attempt confirms that it retains all eleven pullRequest fields, including those two diagnostics; the earlier nine-field assumption was incorrect.

The packet now retains the exact original eleven-field pullRequest object. The original provider context in context.json and the protocol-pinned attempt remain unchanged. Closed-PR provider metadata remains visible alongside the authoritative remote source/base fields. No validator, source pin, hash, gate or authority requirement was relaxed.
