# Decision Scratchpad - tb-storage-root-identity

**Branch start:** 2026-11-26

## [1] Persistent storage identity is the recorded inode; dev is re-recorded, not compared

**Superseded by [2]** after the round 1 brief review.

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: one comparator in scratch.js; reverting restores the strict dev+ino comparison. Re-recorded dev values are the current truth and need no migration.

**Blast Radius:** Installer and scratch root ownership checks; installer entry, installer file and scratch run records written by earlier processes

Records written by an earlier process (root owner.json, installer entries and file stamps, scratch runs) are matched on their inode, with the existing kind, uid, regular-file and private-mode checks unchanged. The recorded dev is kept as the last observed value; writing operations re-record it on the root (installer root under the storage lock, because owner.json also carries successSequence), read-only operations (preview, Doctor) tolerate it without writing. Comparisons within one process still use dev and inode. A root's entries/runs/reports subdirectories must currently be on the root's device, so the tree is still one filesystem. Why: macOS APFS renumbers st_dev across reboots and OS updates while the inode, owner and mode stay, so dev is not a persistent identity. The inode is what actually binds the record to one directory: a deleted and recreated, copied, restored or substituted directory normally gets a different inode and is still refused. Residual risk: a different filesystem mounted at the path whose directory happens to have the same inode and carries a well-formed owner record for this uid; this needs same-uid write access, which defeats any in-directory scheme, and the old check already shared the same-device inode-reuse gap.

**Triggered by:** Security change (ownership check) for issue #159; mandate asks to choose between dev tolerance and a random root ID on the merits

**Alternatives considered:**
(1) Random root ID inside the directory: rejected. The ID lives in the directory it is meant to authenticate, and nothing outside the directory remembers it, so a replaced directory that carries (or is re-created with) an owner record is indistinguishable; it only proves owner.json is well formed. Pinning the ID elsewhere would add a second state location to keep consistent. It could be added later alongside the inode if a stronger binding is needed. (2) Tolerate dev changes only on darwin: rejected; Linux device numbers can also change (LVM, removable or network volumes), and a platform switch would leave CI unable to exercise the rule. (3) Re-record on every open including Doctor and preview: rejected; those paths promise not to mutate storage.

## [2] Supersedes [1]: a changed root device is accepted only when recorded in an earlier boot

**Superseded by [3]** after the round 2 brief review.

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: the rule lives in rootMatches/refreshedRoot in scratch.js. The added boot field is ignored by older GateReeve versions, which still compare dev and inode, so a downgrade behaves as before.

**Blast Radius:** Installer and scratch root ownership checks; installer entry, installer file and scratch run records written by earlier processes; root record format gains a boot field

Root records (installer and scratch owner.json) match their directory by inode always, and by device unless the record's boot identity differs from the current boot (macOS sysctl kern.bootsessionuuid, Linux /proc/sys/kernel/random/boot_id). Writing operations re-record dev and boot (installer root under the storage lock because owner.json also carries successSequence); previews and Doctor accept without writing. A legacy record with no boot field counts as an earlier boot, which is the state of hosts affected today; the first writing open records the boot, after which same-boot device changes are refused. When the host reports no boot identity, any device change is refused as before. Records inside a verified root (installer entries, file stamps, scratch runs) match by inode and must currently sit on the root's device, and the root's entries/runs/reports subdirectories must be on the root's device. Why: APFS renumbering only happens across a reboot or an OS update (which reboots), so binding tolerance to a boot change keeps the old strictness for live substitution (another filesystem or a clone mounted at the path during this boot) while fixing the issue. Residual risk: a faithful clone of the user's own volume substituted across a reboot is indistinguishable from the renumbered original by any in-filesystem record; its records describe GateReeve's own managed data, and same-user writers are not a boundary this check defends.

**Triggered by:** Brief planning review round 1 (codex) F2: inode-only matching accepts another filesystem that carries the same inode and records

**Alternatives considered:**
(1) Inode-only matching (entry [1]): rejected after review; it also accepts a same-boot mount of another filesystem carrying the inode and records. (2) Random root ID inside the directory: rejected; a replaced directory carrying or re-created with a record is indistinguishable, because nothing outside the directory remembers the ID. (3) Filesystem UUID (APFS volume UUID, blkid): rejected; needs platform tools (diskutil) per open and still copies with a block-level clone. (4) Darwin-only tolerance: rejected; Linux device numbers can change across boots too and CI could not exercise the rule. (5) Re-record on every open including Doctor and preview: rejected; those paths promise not to mutate storage.

## [3] Supersedes [2]: a changed root device is accepted only when the record was last written before this boot

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: the rule is rootMatches in scratch.js. No record field is added; older GateReeve versions read the same records and still compare dev and inode.

**Blast Radius:** Installer and scratch root ownership checks; installer entry, installer file and scratch run records written by earlier processes. No record format change.

Root records (installer and scratch owner.json) match their directory by inode always, and by device unless the record file's modification time precedes the current boot's start (Date.now() - os.uptime(); uptime includes sleep on macOS and Linux). The record and its time are read through one O_NOFOLLOW handle. Writing operations re-record dev (installer root under the storage lock because owner.json also carries successSequence), so a later device change in the same boot is refused; previews and Doctor accept without writing. Records inside a verified root (installer entries, file stamps, scratch runs) match by inode and must currently sit on the root's device, and the root's entries/runs/reports directories must be on the root's device. Why: APFS renumbering happens across a reboot or an OS update (which reboots). Binding tolerance to 'written before this boot' keeps the old strictness for a filesystem mounted at the path during this boot against a record written in it, needs no new field, and judges existing records on affected hosts by when they were actually written. Residual risk, which no in-filesystem rule can separate from the renumbering the issue requires accepting: a bit-identical clone of the user's own volume substituted across a reboot (its records describe GateReeve's own data), and a foreign filesystem carrying a copied earlier-boot record and the same inode mounted before the first writing operation of a boot. Same-user writers can forge records and file times and are not a boundary this check defends, as before. Clock steps after boot shift the computed boot start: a step backward makes an earlier-boot record look current, which only refuses (the old behavior) until the next boot; a step forward can make a record written shortly after boot look older.

**Triggered by:** Brief planning review round 2 (codex): the boot-identity field was a record-format change, and legacy records without it were treated as an earlier boot

**Alternatives considered:**
(1) Boot identity field (entry [2]): rejected after review; it changes the record format and cannot judge existing records. (2) Inode-only matching (entry [1]): rejected; accepts a same-boot mount carrying the inode and records. (3) Random root ID inside the directory: rejected; nothing outside the directory remembers the ID, so a replaced directory carrying or re-created with a record is indistinguishable. (4) Filesystem UUID (APFS volume UUID, blkid): rejected; needs platform tools per open and still matches a block-level clone. (5) Darwin-only tolerance: rejected; Linux device numbers can change across boots too and CI could not exercise the rule. (6) Re-record on every open including Doctor and preview: rejected; those paths promise not to mutate storage.

## [4] Extends [3]: a changed root device also requires the root to share its parent's device

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: one condition in rootMatches. It only applies when dev differs from the record, so a root that is a mount point keeps working while its device is stable.

**Blast Radius:** Installer and scratch root ownership checks after a device change

When the recorded dev differs from the root's, acceptance now also requires lstat(dirname(root)).dev === root.dev, so a filesystem mounted at the root path itself is refused. The remaining indistinguishable case needs a filesystem mounted at an ancestor that has a directory at the same path with the same inode number and a copy of the records, which in practice is a clone of the user's own volume. That case is indistinguishable from the renumbered original by any record inside the filesystem, and accepting the renumbered original is the issue's goal. A root deliberately placed at a mount point still works while its device is stable and is refused after a renumbering (the previous behavior).

**Triggered by:** Brief planning review round 3 (codex) F2: a foreign filesystem carrying a copied earlier-boot record and the same inode could be mounted before the first writing operation of a boot

**Alternatives considered:**
(1) Leave [3] unchanged: rejected; a mount at the root path is cheap to detect. (2) Read the mount table (mount, /proc/self/mountinfo) to refuse any root under a mount newer than the record: rejected; platform-specific parsing per open, and it still accepts a clone mounted at boot.

