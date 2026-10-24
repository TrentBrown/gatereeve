# Independent repair probe

Disposable read-only evaluation, separate from formal verdicts.

```javascript
import {mkdtemp,mkdir,cp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPackageWithOptions} from '/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/apps/desktop/node_modules/@electron/asar/lib/asar.js';
import {helperTree} from '/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/plugin-src/shared/resources/protocol/python-guards.js';
const source='/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input/plugin-src/shared/resources';const root=await mkdtemp(join(tmpdir(),'gr-repair13-asar-'));const stage=join(root,'stage');await mkdir(stage);await writeFile(join(stage,'package.json'),'{"type":"module"}\n');
for(const dir of ['protocol','release'])await cp(join(source,dir),join(stage,'resources',dir),{recursive:true});
for(const [path] of await helperTree(join(source,'scripts'))){await mkdir(join(stage,'resources/scripts',path,'..'),{recursive:true});await cp(join(source,'scripts',path),join(stage,'resources/scripts',path));}
await createPackageWithOptions(stage,join(root,'app.asar'),{unpack:'**/resources/scripts/**/*'});await writeFile('/tmp/gr-repair13-asar-path.txt',root);console.log(root);

```
