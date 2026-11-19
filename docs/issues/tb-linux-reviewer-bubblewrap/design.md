# Design - tb-linux-reviewer-bubblewrap

## Problem

GateReeve launches a fresh Codex CLI with `shell_environment_policy.inherit="none"`. This also removes the command PATH used by Linux Bubblewrap discovery. In the aws-1 pilot, both Codex 0.169.1 and 0.170.0 skipped Ubuntu's installed helper under the scrubbed policy. 0.170.0 fell back to its bundled helper and failed to configure its sandbox under AppArmor.

## Intent

GateReeve can use the distribution Bubblewrap executable in fresh Codex reviewers on Linux while keeping the evaluator command environment scrubbed, the snapshot read-only and command networking denied.

## Chosen shape

On Linux, add one constant shell environment setting to the Codex review invocation so helper discovery can search `/usr/bin:/bin`. Keep inherit-none and the current receipt, scratch, and sandbox policy. A distro Bubblewrap installed on this path is eligible for the existing Codex helper resolution. On systems where it is absent, Codex retains its existing fallback. Keep the packaged desktop protocol copy synchronized with the canonical source.

## Alternatives considered

Inheriting the parent PATH can expose user-controlled paths and does not bound discovery to OS directories. Per-host bundled AppArmor profiles depend on executable layout and have to be checked after every CLI update.

## Constraints

Keep provider authentication, shell isolation, and runner config semantics. Preserve non-Linux and Claude Code rollouts. Use a disposable matching plugin copy and the same unprivileged account for the aws-1 pilot. Retain negative observations and avoid restarting active work. Release branch directions and per-PR authorization remain in force.

## Open risks

The direct smoke check with this path worked in both tested CLI versions. Fresh GateReeve planning and the Codex side of paired review must confirm the distro helper, completed receipts and designated isolation controls.
