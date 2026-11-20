# Design interview

## D1. Workflow rigor

- **Question** Which GateReeve workflow rigor should this update use?
- **Answer** Full.
- **Decision** Use the full design and delivery workflow for the four changes and coordinated prerelease.

## D2. Explainer at the final review handoff

- **Question** If explainer generation fails, should GateReeve pause the review handoff for a retry or present the packet with the explainer unavailable?
- **Answer** Agreed with pausing the handoff.
- **Decision** Make the candidate-pinned HTML explainer the primary link in the final handoff for humans and agents, after ordinary verification and paired review. Pause the handoff if explainer generation fails. Retry generation against the same candidate and retained evidence.

## D3. Advisory mutation evidence

- **Question** Should any Mutineer finding pause the review handoff?
- **Answer** Use the advisory behavior.
- **Decision** Keep the detailed PR-scoped report with the pinned acceptance packet and surface its summary and link in the agent thread. Findings and unavailable mutation evidence do not block the handoff. Offer pruning as a separate opt-in workflow when the maintainer wants to investigate test deletion.

## D4. Claude response recovery

- **Question** Should GateReeve automatically retry Claude once when formatting or required fields still fail validation, retaining a valid Codex verdict?
- **Answer** One retry.
- **Decision** Accept a single unambiguous JSON fence wrapped in prose and validate the decoded verdict against the existing contract. On a remaining format or required-field failure, retry only Claude once for the same candidate with specific corrective guidance. Preserve a valid peer verdict. A valid UNAVAILABLE verdict retains its stated evidence gap.

## D5. Verification operation recovery

- **Question** Include oversized operation ID preflight and retained-job recovery in this release?
- **Answer** Yes.
- **Decision** Reject invalid new operation IDs before work starts. Recover already-retained outcomes in place with the original identity, hash, verdict and receipts preserved. Use eligible history IDs in reviewer correction guidance and preserve valid dispositions.

## D6. Ordered reviewer model preferences

- **Question** May GateReeve choose an eligible model, including Sonnet, after exhausting the configured preferences?
- **Answer** Yes, for both Claude and GPT.
- **Decision** Use ordered per-provider preferences in .agentic-workflow.json, with an optional reasoning effort for each model. Select the first available and eligible preference. If no preference qualifies, allow the agent to pick any eligible model from the same provider and record its reasoning. Preserve the two-provider requirement and keep model selection separate from verdict repair.
