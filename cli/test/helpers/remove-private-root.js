import { chmodSync, lstatSync, readdirSync, rmSync } from 'node:fs';

// Reviewer views are sealed read-only; restore owner access (never following
// links) before removing a private test root.
export function removePrivateRoot(path) {
  const open = directory => {
    let stat; try { stat = lstatSync(directory); } catch { return; }
    if (!stat.isDirectory()) return;
    try { chmodSync(directory, stat.mode | 0o700); } catch { /* removal reports it */ }
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) open(`${directory}/${entry.name}`);
  };
  open(path);
  rmSync(path, { recursive: true, force: true });
}
