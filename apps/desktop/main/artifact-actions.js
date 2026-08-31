// @ts-check

import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const execute = promisify(execFile);

export const EDITORS = Object.freeze([
  { id: 'vscode', label: 'VS Code', applications: ['Visual Studio Code.app'] },
  { id: 'cursor', label: 'Cursor', applications: ['Cursor.app'] },
  { id: 'zed', label: 'Zed', applications: ['Zed.app', 'Zed Preview.app'] },
  { id: 'sublime-text', label: 'Sublime Text', applications: ['Sublime Text.app'] },
  { id: 'windsurf', label: 'Windsurf', applications: ['Windsurf.app'] },
  { id: 'intellij-idea', label: 'IntelliJ IDEA', applications: ['IntelliJ IDEA.app', 'IntelliJ IDEA CE.app'] },
  { id: 'bbedit', label: 'BBEdit', applications: ['BBEdit.app'] },
]);

function portable(path) {
  return path.split(sep).join('/');
}

function githubRepository(remote) {
  const value = remote.trim().replace(/\.git$/u, '');
  const match = value.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https?:\/\/github\.com\/)([^/]+\/[^/]+)$/u);
  return match?.[1] ?? null;
}

export async function githubArtifactUrl(path, {
  exec = execute,
  gitExecutable = 'git',
} = {}) {
  if (gitExecutable === null) return null;
  try {
    const rootResult = await exec(gitExecutable, ['-C', dirname(path), 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10_000,
    });
    const root = rootResult.stdout.trim();
    const relativePath = portable(relative(root, path));
    if (!relativePath || relativePath.startsWith('../')) return null;
    const [tracked, remote, head] = await Promise.all([
      exec(gitExecutable, ['-C', root, 'ls-files', '--error-unmatch', '--', relativePath], {
        encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10_000,
      }),
      exec(gitExecutable, ['-C', root, 'remote', 'get-url', 'origin'], {
        encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10_000,
      }),
      exec(gitExecutable, ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8', maxBuffer: 1024, timeout: 10_000,
      }),
    ]);
    if (!tracked.stdout.trim()) return null;
    const repository = githubRepository(remote.stdout);
    if (repository === null || !/^[0-9a-f]{40}$/u.test(head.stdout.trim())) return null;
    const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
    return `https://github.com/${repository}/blob/${head.stdout.trim()}/${encodedPath}`;
  } catch {
    return null;
  }
}

export function createEditorPreferenceStore(userDataPath) {
  const path = join(userDataPath, 'artifact-editor.json');
  let writeQueue = Promise.resolve();
  return Object.freeze({
    path,
    async load() {
      try {
        const value = JSON.parse(await readFile(path, 'utf8'));
        return value?.schemaVersion === 1 && typeof value.editorId === 'string'
          ? value.editorId
          : null;
      } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
        throw error;
      }
    },
    save(editorId) {
      const write = writeQueue.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, editorId }, null, 2)}\n`, {
          encoding: 'utf8', mode: 0o600,
        });
        await rename(temporary, path);
      });
      writeQueue = write.catch(() => {});
      return write;
    },
  });
}

export async function nextAvailableDownloadPath(downloadsPath, filename, {
  exists = async (path) => access(path).then(() => true, () => false),
} = {}) {
  const extension = extname(filename);
  const stem = filename.slice(0, filename.length - extension.length);
  for (let index = 1; index <= 10_000; index += 1) {
    const candidate = join(downloadsPath, index === 1 ? filename : `${stem} ${index}${extension}`);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('Could not choose an available filename in Downloads.');
}

export function createArtifactActions({
  homePath,
  downloadsPath,
  preferenceStore,
  gitExecutable = 'git',
  pathExists = async (path) => access(path).then(() => true, () => false),
  openDefault,
  openApplication,
  chooseApplication,
  chooseSavePath,
  copy = copyFile,
  openExternal,
} = {}) {
  let preferredEditorId = null;
  let editors = [];

  async function discoverEditors() {
    const roots = ['/Applications', join(homePath, 'Applications')];
    const detected = [];
    for (const editor of EDITORS) {
      let applicationPath = null;
      for (const root of roots) {
        for (const application of editor.applications) {
          const candidate = join(root, application);
          if (await pathExists(candidate)) {
            applicationPath = candidate;
            break;
          }
        }
        if (applicationPath !== null) break;
      }
      if (applicationPath !== null) detected.push({ id: editor.id, label: editor.label, applicationPath });
    }
    editors = detected;
    if (!editors.some((editor) => editor.id === preferredEditorId)) preferredEditorId = null;
  }

  function editor(id) {
    return editors.find((item) => item.id === id) ?? null;
  }

  return Object.freeze({
    async initialize() {
      preferredEditorId = await preferenceStore.load();
      await discoverEditors();
    },
    async capabilities(path) {
      const githubUrl = await githubArtifactUrl(path, { gitExecutable });
      return {
        schemaVersion: 1,
        editors: editors.map(({ id, label }) => ({ id, label })),
        preferredEditorId,
        githubAvailable: githubUrl !== null,
      };
    },
    async open(path, editorId = null, remember = false) {
      const requestedEditorId = editorId === null ? preferredEditorId : editorId;
      if (requestedEditorId === null || requestedEditorId === 'default') {
        const result = await openDefault(path);
        if (typeof result === 'string' && result.length > 0) throw new Error(result);
        if (remember) {
          await preferenceStore.save('default');
          preferredEditorId = null;
        }
        return true;
      }
      const selected = editor(requestedEditorId);
      if (selected === null) throw new Error('The selected editor is not installed.');
      await openApplication(selected.applicationPath, path);
      if (remember) {
        await preferenceStore.save(selected.id);
        preferredEditorId = selected.id;
      }
      return true;
    },
    async chooseAndOpen(path) {
      const applicationPath = await chooseApplication();
      if (applicationPath === null) return false;
      if (!applicationPath.endsWith('.app')) throw new Error('Choose a macOS application.');
      await openApplication(applicationPath, path);
      return true;
    },
    async saveAs(path) {
      const destination = await chooseSavePath(basename(path));
      if (destination === null) return false;
      if (resolve(destination) === resolve(path)) throw new Error('Choose a different location for the copy.');
      await copy(path, destination);
      return true;
    },
    async saveToDownloads(path) {
      await mkdir(downloadsPath, { recursive: true });
      const destination = await nextAvailableDownloadPath(downloadsPath, basename(path), { exists: pathExists });
      await copy(path, destination);
      return destination;
    },
    async openOnGithub(path) {
      const url = await githubArtifactUrl(path, { gitExecutable });
      if (url === null) throw new Error('This artifact is not available on GitHub.');
      await openExternal(url);
      return true;
    },
  });
}
