import assert from 'node:assert/strict';
import test from 'node:test';
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentFixture } from './helpers/current-fixture.js';
import { preToolUse } from '../../plugin-src/shared/resources/protocol/current/pre-tool-use.js';
import { classifyShellCommand } from '../../plugin-src/shared/resources/protocol/current/command-guard.js';
import { resolveEntryPoints, UNAVAILABLE } from '../../plugin-src/shared/resources/protocol/current/entry-point.js';
import { currentSnapshot } from '../../plugin-src/shared/resources/protocol/current/adapter.js';
import { resolveWorkflowContext } from '../../plugin-src/shared/resources/protocol/context.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';

const ADAPTER = fileURLToPath(new URL('../../plugin-src/shared/resources/protocol/plugin-adapter.js', import.meta.url));
const NO_CLI = { PATH: '/nonexistent-gatereeve-test-path' };

// Merge forms the guard must deny without any workspace configuration.
const MERGES = [
  'gh pr merge 12',
  'gh pr merge',
  'gh pr merge 12 --squash --delete-branch',
  'gh pr merge --auto 12',
  'gh pr merge https://github.com/o/r/pull/12',
  'gh -R o/r pr merge 12',
  'gh --repo o/r pr merge 12',
  'gh --repo=o/r pr merge 12',
  'gh pr merge -R o/r 12',
  '/usr/bin/gh pr merge 12',
  './gh pr merge 12',
  'bin/gh pr merge 12',
  '\\gh pr merge 12',
  '"gh" pr merge 12',
  'GH_TOKEN=x GH_REPO=o/r gh pr merge 12',
  'env GH_TOKEN=x gh pr merge 12',
  'sudo gh pr merge 12',
  'sudo -u builder gh pr merge 12',
  'command gh pr merge 12',
  'exec gh pr merge 12',
  'nohup gh pr merge 12',
  'timeout 30 gh pr merge 12',
  'xargs -n1 gh pr merge',
  'git status && gh pr merge 12',
  'false || gh pr merge 12',
  'cd repo; gh pr merge 12',
  'gh pr checks 12 | gh pr merge 12',
  'gh pr checks 12 & gh pr merge 12',
  'echo ready\ngh pr merge 12',
  '(gh pr merge 12)',
  '{ gh pr merge 12; }',
  'if true; then gh pr merge 12; fi',
  'echo $(gh pr merge 12)',
  'echo "$(gh pr merge 12)"',
  'echo `gh pr merge 12`',
  "bash -c 'gh pr merge 12'",
  'sh -c "cd repo && gh pr merge 12"',
  "bash -lc 'gh pr merge 12'",
  "zsh -c 'gh pr merge 12'",
  'bash <<EOF\ngh pr merge 12\nEOF',
  // A heredoc inside $(...) is data, but commands after it are still seen (S4 N2).
  "x=$(cat <<'EOF'\n)\nEOF\n); gh pr merge 12",
  "notes=$(cat <<EOF\nWon't (stop\nEOF\n) && gh pr merge 12",
  'echo $(bash <<EOF\ngh pr merge 12\nEOF\n)',
  'x=$(true # a comment mentioning <<EOF\n); gh pr merge 12',
  // Parameter expansions and arithmetic hold no comments or heredocs (S6 review N1).
  'echo ${X:- #}; gh pr merge 12',
  'echo ${X:-<<EOF}\ngh pr merge 12',
  'echo $(( 1 #2 )); gh pr merge 12',
  'bash <<< "gh pr merge 12"',
  "eval 'gh pr merge 12'",
  'env -S "gh pr merge 12"',
  'gh alias set ship "pr merge"',
  'gh api -X PUT repos/o/r/pulls/12/merge',
  'gh api -XPUT repos/o/r/pulls/12/merge',
  'gh api --method PUT repos/o/r/pulls/12/merge',
  'gh api --method=put /repos/o/r/pulls/12/merge',
  'gh api repos/{owner}/{repo}/pulls/12/merge -X PUT -f merge_method=squash',
  'gh api repos/o/r/pulls/12/merge -f merge_method=squash',
  'gh api https://api.github.com/repos/o/r/pulls/12/merge -X PUT',
  'gh -R o/r api -X PUT repos/o/r/pulls/12/merge',
  "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
  "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
];

// Unrelated commands, quoted text and read-only calls the guard must leave alone.
const ALLOWED = [
  'gh pr view 12',
  'gh pr create --fill --base main',
  'gh pr checks 12 --watch',
  'gh pr list --search "merge"',
  'gh pr review 12 --approve',
  'gh api repos/o/r/pulls/12',
  'gh api -X GET repos/o/r/pulls/12/merge',
  'gh api graphql -f query=\'query { viewer { login } }\'',
  'echo "gh pr merge 12"',
  "echo 'gh pr merge 12'",
  'printf "%s\\n" "run gh pr merge later"',
  "git commit -m 'Explain why gh pr merge is guarded'",
  'git commit -F - <<\'EOF\'\nGuard gh pr merge forms\n\ngh pr merge is denied\nEOF',
  'cat <<EOF > notes.md\ngh pr merge 12\nEOF',
  // Unbalanced parentheses or quotes in a heredoc body inside $(...) (S4 N2).
  "msg=$(cat <<'EOF'\nClose the paren) early; gh pr merge is guarded\nEOF\n)\ngit commit -m \"$msg\"",
  "msg=$(cat <<-EOF\n\tWon't (merge; gh pr merge later\n\tEOF\n)\necho \"$msg\"",
  'git commit -m "$(cat <<\'EOF\'\nFix (parser) :) and gh pr merge text\nEOF\n)"',
  'grep -rn "gh pr merge" docs',
  'git log --grep="gh pr merge"',
  'cat <<< "gh pr merge 12"',
  '# gh pr merge 12',
  'command -v gh',
  'npm test',
  'git merge --ff-only origin/main',
  'git pull --rebase',
  'git fetch origin main',
  'ghx pr merge 12',
  'node scripts/gh-pr-merge.js',
];

const merges = command => classifyShellCommand(command).filter(item => item.kind !== 'git-push');

test('guard corpus: every merge form is recognized and unrelated commands are not', () => {
  for (const command of MERGES) assert.ok(merges(command).length > 0, `expected a merge finding for ${JSON.stringify(command)}`);
  for (const command of ALLOWED) assert.deepEqual(classifyShellCommand(command), [], `expected no finding for ${JSON.stringify(command)}`);
});

async function configured(t) {
  const f = await currentFixture(t, { releaseBranch: 'production' });
  await f.request('run.start', { implementers: ['implementer'], runId: 'guard-test' }, 'guard-start');
  return f;
}

test('merge denials carry milestone reasons and name the bundled adapter when no CLI is on PATH', async t => {
  const f = await configured(t);
  for (const command of MERGES) {
    const decision = (await preToolUse({ cwd: f.repo, tool_input: { command } }, { env: NO_CLI })).hookSpecificOutput;
    assert.equal(decision?.permissionDecision, 'deny', command);
    const reason = decision.permissionDecisionReason;
    assert.match(reason, /Merge milestone is blocked/u, command);
    assert.ok(reason.includes(ADAPTER), command);
    assert.match(reason, /--request-file <request\.json>.*"operation":"merge\.prepare".*"operation":"merge\.execute"/u);
    assert.match(reason, /"repository":"app"/u);
    assert.doesNotMatch(reason, /gatereeve merge/u, 'The CLI is not named when it is not on PATH');
    assert.match(reason, /best-effort/u);
  }
  await access(ADAPTER);
  const numbered = (await preToolUse({ cwd: f.repo, tool_input: { cmd: 'gh pr merge 42 --squash' } }, { env: NO_CLI })).hookSpecificOutput;
  assert.match(numbered.permissionDecisionReason, /"number":42,"method":"squash"/u);
  for (const command of ALLOWED) assert.deepEqual(await preToolUse({ cwd: f.repo, tool_input: { command } }, { env: NO_CLI }), {}, command);
});

test('pushes to the configured integration or release branch are denied; topic pushes are not', async t => {
  const f = await configured(t);
  const decide = (command, cwd = f.repo) => preToolUse({ cwd, tool_input: { command } }, { env: NO_CLI });
  const denied = {
    'git push origin main': /integration branch main/u,
    'git push origin HEAD:main': /integration branch main/u,
    'git push origin topic:main': /integration branch main/u,
    'git push origin +main': /integration branch main/u,
    'git push --force origin main': /integration branch main/u,
    'git push -f origin HEAD:refs/heads/main': /integration branch main/u,
    'git push origin :main': /integration branch main/u,
    'git push --delete origin main': /integration branch main/u,
    'git push origin topic:production': /release branch production/u,
    'git push origin refs/heads/topic:refs/heads/production': /release branch production/u,
    'git push upstream production': /release branch production/u,
    'git push --all origin': /release branch production/u,
    'git push origin "refs/heads/*:refs/heads/*"': /release branch production/u,
    '/usr/bin/git push origin main': /integration branch main/u,
    'GIT_TRACE=1 git push origin main': /integration branch main/u,
    'git -c push.default=current push origin main': /integration branch main/u,
    'git status && git push origin main': /integration branch main/u,
    "bash -c 'git push origin main'": /integration branch main/u,
    'echo $(git push origin production)': /release branch production/u,
    // NEW3: the matching refspec updates every branch present on both sides.
    'git push origin :': /release branch production/u,
    'git push origin +:': /integration branch main/u,
    'git push --force upstream +:': /release branch production/u,
    'git push origin topic :': /integration branch main/u,
  };
  for (const [command, pattern] of Object.entries(denied)) {
    const decision = (await decide(command)).hookSpecificOutput;
    assert.equal(decision?.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason, pattern, command);
    assert.match(decision.permissionDecisionReason, /Push a topic branch and open a PR/u, command);
    assert.ok(decision.permissionDecisionReason.includes(ADAPTER), command);
  }
  for (const command of ['git push origin topic', 'git push -u origin topic', 'git push origin HEAD', 'git push', 'git push origin', 'git push origin main:topic', 'git push origin v1.0.0', 'git push origin refs/tags/main', 'echo "git push origin main"']) {
    assert.deepEqual(await decide(command), {}, command);
  }
  // An implicit destination resolves to the current branch.
  await git(f.repo, ['switch', '-c', 'main']);
  for (const command of ['git push', 'git push origin', 'git push origin HEAD', `git -C ${JSON.stringify(f.repo)} push`]) {
    assert.match((await decide(command, command.includes(" -C ") ? f.root : f.repo)).hookSpecificOutput?.permissionDecisionReason ?? '', /integration branch main/u, command);
  }
  // --tags alone pushes only tags (no implicit branch); with a protected refspec it is still denied (S4 N4).
  for (const command of ['git push --tags', 'git push origin --tags', 'git push --tags origin', 'git push origin --tags v1.0.0']) assert.deepEqual(await decide(command), {}, command);
  for (const command of ['git push --tags origin main', 'git push origin --tags HEAD', 'git push origin --tags topic:main']) {
    assert.match((await decide(command)).hookSpecificOutput?.permissionDecisionReason ?? '', /integration branch main/u, command);
  }
  assert.match((await decide('git push --follow-tags')).hookSpecificOutput?.permissionDecisionReason ?? '', /integration branch main/u, '--follow-tags also pushes the branch');
});

test('a push is checked in every repository it could act on, per the documented coverage list (NEW6-NEW21)', async t => {
  const f = await configured(t);
  const outside = await mkdtemp(join(tmpdir(), 'gatereeve-guard-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await git(outside, ['init', '-b', 'main']);
  const q = JSON.stringify;
  const gitDir = q(join(f.repo, '.git'));
  const decide = (cwd, command) => preToolUse({ cwd, tool_input: { command } }, { env: NO_CLI });
  // From the unconfigured directory itself nothing is protected.
  assert.deepEqual(await decide(outside, 'git push origin main'), {});
  const denied = [
    // NEW6: -C in both spellings, in order.
    [outside, `git -C ${q(f.repo)} push origin main`],
    [outside, `git ${q(`-C${f.repo}`)} push origin main`],
    [outside, `git -C ${q(f.root)} -Capp push origin main`],
    [outside, `git ${q(`-C${f.root}`)} -C app push origin production`],
    [outside, `cd /; git ${q(`-C${f.repo}`)} push origin main`],
    // The Git directory selects the repository: option or environment.
    [outside, `git --git-dir=${gitDir} push origin main`],
    [outside, `git --git-dir ${gitDir} push origin main`],
    [outside, `git -C ${q(f.root)} --git-dir app/.git push origin main`],
    [outside, `GIT_DIR=${gitDir} git push origin main`],
    [outside, `env GIT_DIR=${gitDir} git push origin main`],
    // Wrapper directories.
    [outside, `env -C ${q(f.repo)} git push origin main`],
    [outside, `env ${q(`--chdir=${f.repo}`)} git push origin main`],
    [outside, `sudo -D ${q(f.repo)} git push origin production`],
    // NEW7: a work tree selects only the checkout; the repository Git runs in still counts.
    [f.repo, `git --work-tree=${q(outside)} push origin main`],
    [f.repo, `git --work-tree ${q(outside)} push origin production`],
    [f.repo, `GIT_WORK_TREE=${q(outside)} git push origin main`],
    [outside, `git --git-dir=${gitDir} --work-tree=${q(outside)} push origin main`],
    [outside, `GIT_DIR=${gitDir} GIT_WORK_TREE=${q(outside)} git push origin main`],
    // NEW9: wrapper directories and GIT_DIR carry into shells, eval and env -S.
    [outside, `GIT_DIR=${gitDir} sh -c 'git push origin main'`],
    [outside, `GIT_DIR=${gitDir} eval 'git push origin main'`],
    [outside, `GIT_DIR=${gitDir} env -S 'git push origin main'`],
    [outside, `env -C ${q(f.repo)} sh -c 'git push origin main'`],
    [outside, `env -C ${q(f.root)} -S 'GIT_DIR=app/.git git push origin main'`],
    // NEW12: env -S appends the remaining arguments to the split string.
    [outside, `env -C ${q(f.repo)} -S git push origin main`],
    [outside, 'env -S gh pr merge 12'],
    [outside, 'env --split-string=gh pr merge 12'],
    // NEW13: the split string is env's own arguments, options included.
    [outside, `env -S ${q(`-C ${f.repo} gh pr merge 12`)}`],
    [outside, `env -S ${q(`--chdir=${f.repo} git push origin main`)}`],
    // NEW14: env -u/-i and sudo drop an earlier GIT_DIR before the repository is chosen.
    [outside, `GIT_DIR=${q(join(outside, '.git'))} env -u GIT_DIR git -C ${q(f.repo)} push origin main`],
    [outside, `GIT_DIR=${q(join(outside, '.git'))} env --unset=GIT_DIR git -C ${q(f.repo)} push origin main`],
    [outside, `GIT_DIR=${q(join(outside, '.git'))} env -i git -C ${q(f.repo)} push origin main`],
    [outside, `GIT_DIR=${q(join(outside, '.git'))} sudo git -C ${q(f.repo)} push origin main`],
    [outside, `GIT_DIR=${q(join(outside, '.git'))} env --unset OTHER --unset GIT_DIR git -C ${q(f.repo)} push origin main`],
    [outside, `GIT_DIR=${q(join(outside, '.git'))} env --unset OTHER -i git -C ${q(f.repo)} push origin main`],
    // NEW13: outside quotes, env's \_ escape separates arguments.
    [outside, "env -S 'gh\\_pr\\_merge\\_12'"],
    // NEW8: literal cd/pushd earlier in a plain sequence (;, &&, newlines).
    [outside, `cd ${q(f.repo)} && git push origin main`],
    [outside, `cd ${q(f.repo)}; git push origin main`],
    [outside, `cd ${q(f.root)}\ncd app\ngit push origin production`],
    [outside, `pushd ${q(f.repo)} && git push origin main`],
    [outside, `builtin cd ${q(f.repo)}; git push origin main`],
    [outside, `cd ${q(f.root)} && git -C app push origin main`],
    [outside, `cd ${q(f.repo)}; echo $(git push origin main)`],
    [outside, `cd ${q(f.repo)}; false && cd ${q(outside)}; git push origin main`],
    [outside, `test -d x && cd ${q(f.repo)}; git push origin main`],
    [outside, `cd ${q(f.repo)} || exit 1; git push origin main`],
    [f.repo, `cd ${q(outside)} || git push origin main`],
    [outside, `cd ${q(f.repo)} && (cd ${q(outside)}); git push origin main`],
    [outside, `(cd ${q(f.repo)} && git push origin main)`],
    [outside, `cd ${q(f.repo)} && git push origin main &`],
    [outside, `cd ${q(f.repo)}; if true; then git push origin main; fi`],
    [outside, `cd ${q(f.repo)} && bash -c 'git push origin main'`],
    [outside, `cd "$HOME"; git -C ${q(f.repo)} push origin main`],
    // NEW18: a wrapped builtin cannot change the calling shell.
    [outside, `cd ${q(f.repo)}; env -C ${q(outside)} eval true; git push origin main`],
    [outside, `cd ${q(f.repo)}; sudo cd ${q(outside)}; git push origin main`],
    // NEW8: a newline after && continues the list.
    [outside, `cd ${q(f.repo)}; false &&\ncd ${q(outside)}; git push origin main`],
    // NEW19: the separated long split-string option.
    [outside, "env --split-string 'gh pr merge 12'"],
    [outside, `env --split-string ${q(`git -C ${f.repo} push origin main`)}`],
    // NEW20: a pipeline's status is its last command's; a subshell keeps its status.
    [outside, `false | true && cd ${q(f.repo)}; git push origin main`],
    [outside, `false; (true) && cd ${q(f.repo)}; git push origin main`],
    [outside, `true; (false) || cd ${q(f.repo)}; git push origin main`],
    [outside, `cd ${q(f.repo)}; false && (true; true) && cd ${q(outside)}; git push origin main`],
    [outside, `cd ${q(f.repo)}; (exit 0); git push origin main`],
    [outside, `(false) | true && cd ${q(f.repo)}; git push origin main`],
    // NEW21: an unquoted heredoc body is subject to command substitution.
    [outside, 'cat <<EOF\n$(gh pr merge 12)\nEOF'],
    [outside, 'cat <<EOF\n`gh pr merge 12`\nEOF'],
    [outside, 'cat <<EO\\\nF\n$(gh pr merge 12)\nEOF'],
    [outside, `cd ${q(outside)}; (exit 3) || cd ${q(f.repo)}; git push origin main`],
    [outside, `cat <<EOF\n$(git -C ${q(f.repo)} push origin main)\nEOF`],
    // Past the tracked number of possible directories a push is denied, not admitted.
    [outside, `${['a', 'b', 'c', 'd', 'e'].map(name => `test -d ${name} && cd ${name}`).join('; ')}; git push origin topic`],
  ];
  for (const [cwd, command] of denied) {
    const decision = (await decide(cwd, command)).hookSpecificOutput;
    assert.equal(decision?.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason, /(integration branch main|release branch production|merge milestone|more directories than the guard tracks)/iu, command);
  }
  for (const [cwd, command] of [
    [outside, `git ${q(`-C${f.repo}`)} push origin topic`],
    [outside, `GIT_DIR=${gitDir} sh -c 'git push origin topic'`],
    [outside, `cd ${q(f.repo)} && git push origin topic`],
    // A work tree or another Git directory does not make an unrelated push protected.
    [outside, `git --work-tree=${q(f.repo)} push origin main`],
    [f.repo, `git --git-dir=${q(join(outside, '.git'))} push origin main`],
    // NEW11: a later command does not change an earlier push, and a certain cd
    // replaces the directory rather than adding to it.
    [outside, `git push origin main; cd ${q(f.repo)}`],
    [outside, `echo $(git push origin main); cd ${q(f.repo)}`],
    [f.repo, `cd ${q(outside)} && git push origin main`],
    [f.repo, `cd ${q(outside)}; git push origin main`],
    // A subshell's cd ends with it; a pipeline or background cd changes nothing.
    [outside, `(cd ${q(f.repo)}); git push origin main`],
    [outside, `cd ${q(f.repo)} | cat; git push origin main`],
    [outside, `cd ${q(f.repo)} & git push origin main`],
    [outside, `true ||\ncd ${q(f.repo)}; git push origin main`],
    [outside, `true | false && cd ${q(f.repo)}; git push origin main`],
    [outside, `true; (false) && cd ${q(f.repo)}; git push origin main`],
    [outside, `(cd ${q(f.repo)}; true) && git push origin main`],
    [outside, `true || (false; false) || cd ${q(f.repo)}; git push origin main`],
    [outside, `(exit 0) || cd ${q(f.repo)}; git push origin main`],
    [outside, `cd ${q(f.repo)}; (exit 0) && cd ${q(outside)}; git push origin main`],
    [outside, `(exit 3) && cd ${q(f.repo)}; git push origin main`],
    [outside, "cat <<'EOF'\n$(gh pr merge 12)\nEOF"],
    [outside, 'cat <<\\EOF\n`gh pr merge 12`\nEOF'],
    // NEW15: superseded directories are not checked, inside compound commands too.
    [outside, `cd ${q(f.repo)}; cd ${q(outside)}; { git push origin main; }`],
    [outside, `cd ${q(f.repo)}; cd ${q(outside)}; if true; then git push origin main; fi`],
    [f.repo, `(cd ${q(outside)} && git push origin main)`],
    [f.repo, `cd ${q(outside)} || exit 1; git push origin main`],
    // Outside the coverage list the location is unknown, so an unrelated push is
    // admitted rather than checked where it does not run.
    [f.repo, `if true; then cd ${q(outside)}; fi; git push origin main`],
    [f.repo, `for d in x; do cd ${q(outside)}; git push origin main; done`],
    [f.repo, `eval ${q(`cd ${outside}`)}; git push origin main`],
    [f.repo, `export GIT_DIR=${q(join(outside, '.git'))}; git push origin main`],
    [f.repo, `cd "$OUT"; git push origin main`],
    [f.repo, `f() { cd ${q(outside)}; }; f; git push origin main`],
    // NEW13: split-string text is arguments, not shell syntax.
    [outside, `env -S ${q('echo ok; gh pr merge 12')}`],
    [outside, 'env git commit -S -m signed'],
  ]) assert.deepEqual(await decide(cwd, command), {}, command);
  const at = command => classifyShellCommand(command)[0].locations;
  assert.deepEqual(at('git push origin main'), [[]]);
  assert.deepEqual(at('git -C/w -Crepo -cpush.default=current push'), [['/w', 'repo']]);
  assert.deepEqual(at('git -C /w -C /v push'), [['/v']], 'an absolute directory replaces earlier steps');
  assert.deepEqual(at('git --git-dir=/w/repo/.git push'), [['/w/repo/.git', '..']]);
  assert.deepEqual(at('git --git-dir=/w/bare.git push'), [['/w/bare.git']]);
  assert.deepEqual(at('git -C /w --work-tree repo --git-dir /x/.git push'), [['/x/.git', '..']]);
  assert.deepEqual(at('git -C /w --work-tree=repo push'), [['/w']]);
  assert.deepEqual(at('git -C /w --git-dir repo/.git push'), [['/w', 'repo/.git', '..']]);
  assert.deepEqual(at('GIT_DIR=/e/.git git --git-dir=/f/.git push'), [['/f/.git', '..']], 'the option overrides the environment');
  assert.deepEqual(at('sudo -C 3 -D/w git push'), [['/w']], 'sudo -C closes descriptors; -D changes directory');
  assert.deepEqual(at("sudo -D/w env -C x bash -c 'git -Cy push'"), [['/w', 'x', 'y']]);
  assert.deepEqual(at("GIT_DIR=/a/.git bash -c 'GIT_DIR=/b/.git git push'"), [['/b/.git', '..']], 'an inner assignment overrides the inherited one');
  assert.deepEqual(at('GIT_DIR=/a/.git sudo -E git push'), [['/a/.git', '..']], 'sudo -E preserves the environment');
  assert.deepEqual(at('cd a && cd b; git push'), [['a', 'b']], 'a cd is assumed to succeed');
  assert.deepEqual(at('x && cd b; git push'), [['b'], []], 'a cd after && may not run');
  assert.deepEqual(at('cd /a || git push'), [[]], 'after cd || the shell is where it was');
  assert.deepEqual(at('cd /a; cd b; x || git push'), [['/a', 'b']]);
  assert.deepEqual(at('false && git push'), [], 'a push that cannot run has no location');
  assert.deepEqual(at('if x; then cd /a; fi; git push'), [], 'a change inside a compound command is not followed');
  assert.equal(classifyShellCommand('if x; then cd /a; fi; git push')[0].unknown, true);
  assert.deepEqual(at('cd $X; cd /a; git push'), [['/a']], 'an absolute cd names the directory again');
  assert.deepEqual(at('GIT_DIR=/a/.git; git push'), []);
  assert.deepEqual(at('export GIT_DIR=/a/.git; unset GIT_DIR; git push'), [[]]);
  assert.equal(classifyShellCommand('git push')[0].overflow, undefined);
});

test('an unconfigured Git workspace names no protected branches', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-guard-legacy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ['init', '-b', 'main']);
  assert.deepEqual(await preToolUse({ cwd: root, tool_input: { command: 'git push origin main' } }, { env: NO_CLI }), {});
  assert.equal((await preToolUse({ cwd: root, tool_input: { command: 'gh pr merge 1' } }, { env: NO_CLI })).hookSpecificOutput.permissionDecision, 'deny');
});

async function cliOnPath(t) {
  const bin = await mkdtemp(join(tmpdir(), 'gatereeve-guard-bin-'));
  t.after(() => rm(bin, { recursive: true, force: true }));
  await writeFile(join(bin, 'gatereeve'), '#!/bin/sh\nexit 0\n');
  await chmod(join(bin, 'gatereeve'), 0o755);
  return { PATH: bin, cli: join(bin, 'gatereeve') };
}

test('entry points: the CLI is named only when it is on PATH; an unusable adapter is never named', async t => {
  const { PATH, cli } = await cliOnPath(t);
  assert.deepEqual(await resolveEntryPoints({ env: NO_CLI }), { adapter: ADAPTER, cli: null });
  assert.deepEqual(await resolveEntryPoints({ env: { PATH } }), { adapter: ADAPTER, cli });
  // A non-executable file of that name is not an entry point.
  const plain = await mkdtemp(join(tmpdir(), 'gatereeve-guard-plain-'));
  t.after(() => rm(plain, { recursive: true, force: true }));
  await writeFile(join(plain, 'gatereeve'), 'not executable');
  assert.equal((await resolveEntryPoints({ env: { PATH: plain } })).cli, null);
  assert.equal((await resolveEntryPoints({ env: NO_CLI, adapterPath: '/Applications/GateReeve.app/Contents/Resources/app.asar/resources/protocol/plugin-adapter.js' })).adapter, null);
  assert.equal((await resolveEntryPoints({ env: NO_CLI, adapterPath: join(plain, 'missing-adapter.js') })).adapter, null);

  const f = await configured(t);
  const withCli = (await preToolUse({ cwd: f.repo, tool_input: { command: 'gh pr merge 7' } }, { env: { PATH } })).hookSpecificOutput.permissionDecisionReason;
  assert.match(withCli, /CLI: gatereeve merge prepare --number <PR> --source-repository <alias>, then gatereeve merge execute/u);
  assert.ok(withCli.includes(ADAPTER));
  const nothing = (await preToolUse({ cwd: f.repo, tool_input: { command: 'gh pr merge 7' } }, { env: NO_CLI, adapterPath: join(plain, 'missing-adapter.js') })).hookSpecificOutput.permissionDecisionReason;
  assert.ok(nothing.includes(UNAVAILABLE));
  assert.doesNotMatch(nothing, /gatereeve merge|plugin-adapter/u);
});

test('status recovery actions and messages name only installed entry points', async t => {
  const { PATH } = await cliOnPath(t);
  const f = await currentFixture(t);
  await mkdir(f.home, { recursive: true });
  const context = await resolveWorkflowContext({ cwd: f.repo });
  const without = await currentSnapshot(context, {}, { environment: NO_CLI });
  assert.equal(without.mode, 'current-entry');
  assert.deepEqual(without.entryPoints, { adapter: ADAPTER, cli: null });
  assert.equal(without.actions[0].id, 'resume-current');
  assert.equal(without.actions[0].entryPoint, 'adapter');
  assert.equal(without.actions[0].command, `node '${ADAPTER}' --request-file <request.json>`);
  assert.equal(without.actions[0].request.operation, 'run.resume-current');
  assert.ok(without.blockers[0].message.includes(ADAPTER));
  assert.doesNotMatch(JSON.stringify(without.actions) + without.blockers[0].message, /gatereeve /u);
  assert.deepEqual(without.branches, [{ alias: 'app', integrationBranch: 'main', releaseBranch: 'main' }]);

  const withCli = await currentSnapshot(context, {}, { environment: { PATH } });
  assert.equal(withCli.actions[0].command, 'gatereeve run resume-current --help');
  assert.match(withCli.blockers[0].message, /CLI: gatereeve run resume-current/u);

  await f.request('run.start', { implementers: ['implementer'] }, 'start');
  const governed = await currentSnapshot(context, {}, { environment: NO_CLI });
  assert.deepEqual(governed.actions.map(item => item.operation), ['status', 'next', 'gate.execute', 'human.decide', 'authorization.apply', 'planning.review', 'delegation.apply']);
  assert.equal(governed.actions[0].command, `node '${ADAPTER}' status --cwd '${f.repo}'`);
  assert.ok(governed.actions.every(item => item.entryPoint === 'adapter' && item.command.includes(ADAPTER)));
  const governedCli = await currentSnapshot(context, {}, { environment: { PATH } });
  assert.ok(governedCli.actions.every(item => item.entryPoint === 'cli' && item.command.startsWith('gatereeve ')));
});
