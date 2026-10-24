# Decisions - tb-multirepo-review-input

## D-implementation-1: one current runtime with reusable proof mechanics

Promoted from scratchpad [1]. The canonical current core is implemented in
protocol/current. Public CLI, native and Desktop consumers cut over together.
The old state-machine interpreter, scheduling DAG and owner-ordering mutation
surfaces are removed. Resolver, fresh provider adapters, structured receipts,
release trust and artifact/terminal isolation remain reusable mechanics.

Historical user journals are retained as files, never replayed by the new core.
Installed rc.16 continues governing this implementation record until separately
authorized installation/resumption. Local generated candidates are not releases.

The approved interview D1-D10 and design remain controlling product decisions.
