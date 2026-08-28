import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const workflowPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/coordinated-release-prepare.yml'
);

test('coordinated preparation is pre-publication, exact-source, and dual-architecture', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /^permissions:\n\s+contents: read$/m);
  assert.match(workflow, /commit: \$\{\{ steps\.source\.outputs\.commit \}\}/);
  assert.match(workflow, /ref: \$\{\{ needs\.resolve-source\.outputs\.commit \}\}/);
  assert.match(workflow, /architecture: arm64/);
  assert.match(workflow, /architecture: x64/);
  assert.match(workflow, /plugin release coordinate/);
  assert.match(workflow, /coordinated-desktop-evidence-\$\{\{ matrix\.architecture \}\}/);
  assert.match(workflow, /environment:\n\s+name: release-publication\n\s+deployment: false/);
  assert.match(workflow, /needs:[\s\S]*desktop-verification[\s\S]*environment:/);
  assert.match(workflow, /GATEREEVE_DEVELOPER_ID_P12_BASE64/);
  assert.match(workflow, /GATEREEVE_NOTARY_KEY_P8_BASE64/);
  assert.match(workflow, /security create-keychain/);
  assert.match(workflow, /GATEREEVE_ORIGINAL_KEYCHAINS/);
  assert.match(workflow, /security list-keychains -d user -s/);
  assert.match(
    workflow,
    /security list-keychains -d user -s[\s\\]+"\$keychain_path"[\s\\]+"\$\{original_keychains\[@\]\}"/
  );
  assert.match(
    workflow,
    /security list-keychains -d user -s[\s\\]+"\$\{original_keychains\[@\]\}" \|\| true/
  );
  assert.match(workflow, /security delete-keychain/);
  assert.match(workflow, /--result-file "\$RUNNER_TEMP\/trusted-package\.json"/);
  assert.doesNotMatch(workflow, /> "\$RUNNER_TEMP\/trusted-package\.json"/);
  assert.match(workflow, /notarize-macos\.mjs/);
  assert.match(workflow, /trusted_bundle="\$RUNNER_TEMP\/coordinated-desktop-trusted"/);
  assert.match(
    workflow,
    /cp \\\n\s+"apps\/desktop\/dist\/macos\/GateReeve-\$\{VERSION\}-macos-universal\.dmg" \\\n\s+"\$trusted_bundle\/"/
  );
  assert.match(workflow, /cp "\$RUNNER_TEMP\/apple-trust\.json" "\$trusted_bundle\/"/);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/coordinated-desktop-trusted/);
  assert.doesNotMatch(
    workflow,
    /path: \|\n\s+apps\/desktop\/dist\/macos\/GateReeve-\*-macos-universal\.dmg/
  );
  assert.match(workflow, /coordinated-desktop-trusted-evidence-\$\{\{ matrix\.architecture \}\}/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /gh release create/);
  assert.doesNotMatch(workflow, /git push/);
  assert.doesNotMatch(workflow, /publish-marketplace\.sh/);
});
