// @ts-check

import { randomUUID } from 'node:crypto';
import { basename, isAbsolute } from 'node:path';

export const TERMINAL_OUTPUT_LIMIT = 1_000_000;
export const TERMINAL_INPUT_LIMIT = 65_536;
export const TERMINAL_MIN_COLUMNS = 2;
export const TERMINAL_MAX_COLUMNS = 500;
export const TERMINAL_MIN_ROWS = 1;
export const TERMINAL_MAX_ROWS = 300;

function requireProject(project) {
  if (
    !project
    || typeof project !== 'object'
    || typeof project.path !== 'string'
    || !isAbsolute(project.path)
    || typeof project.name !== 'string'
    || project.name.length === 0
  ) {
    throw new TypeError('A trusted saved project is required.');
  }
  return { path: project.path, name: project.name };
}

export function requireTerminalDimensions(value) {
  if (
    !value
    || typeof value !== 'object'
    || !Number.isInteger(value.cols)
    || !Number.isInteger(value.rows)
    || value.cols < TERMINAL_MIN_COLUMNS
    || value.cols > TERMINAL_MAX_COLUMNS
    || value.rows < TERMINAL_MIN_ROWS
    || value.rows > TERMINAL_MAX_ROWS
  ) {
    throw new TypeError('Terminal dimensions are invalid.');
  }
  return { cols: value.cols, rows: value.rows };
}

function requireInput(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > TERMINAL_INPUT_LIMIT) {
    throw new TypeError('Terminal input is invalid.');
  }
  return value;
}

function cleanEnvironment(value) {
  const environment = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (typeof item === 'string') environment[key] = item;
  }
  environment.TERM = 'xterm-256color';
  environment.COLORTERM = 'truecolor';
  return environment;
}

export function resolveAccountShell({ platform, user, environment }) {
  if (!['darwin', 'linux'].includes(platform)) {
    throw new Error(`Interactive terminals are not supported on ${platform}.`);
  }
  const shell = typeof user?.shell === 'string' && user.shell.length > 0
    ? user.shell
    : environment?.SHELL;
  if (typeof shell !== 'string' || !isAbsolute(shell)) {
    throw new Error('The operating-system account has no usable configured login shell.');
  }
  return Object.freeze({ path: shell, name: basename(shell), args: ['-l'] });
}

function appendBounded(current, chunk, limit) {
  const next = `${current}${chunk}`;
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function publicSession(session) {
  return Object.freeze({
    schemaVersion: 1,
    id: session.id,
    projectName: session.project.name,
    shell: session.shell.name,
    status: session.status,
    cols: session.cols,
    rows: session.rows,
    output: session.output,
    exit: session.exit === null ? null : { ...session.exit },
    error: session.error,
  });
}

function dispose(item) {
  try {
    item?.dispose?.();
  } catch {
    // A listener that is already gone must not block terminal cleanup.
  }
}

export function createTerminalManager({
  spawn,
  userInfo,
  environment = process.env,
  platform = process.platform,
  createId = randomUUID,
  killProcessGroup,
  outputLimit = TERMINAL_OUTPUT_LIMIT,
}) {
  if (typeof spawn !== 'function') throw new TypeError('A PTY spawn adapter is required.');
  if (typeof userInfo !== 'function') throw new TypeError('An account resolver is required.');
  if (typeof killProcessGroup !== 'function') {
    throw new TypeError('A process-group termination adapter is required.');
  }
  if (!Number.isSafeInteger(outputLimit) || outputLimit < 1) {
    throw new TypeError('The terminal output limit is invalid.');
  }

  const byProject = new Map();
  const byId = new Map();
  const listeners = new Set();
  let closed = false;

  function emit(event) {
    for (const listener of listeners) listener(event);
  }

  function owned(projectPath, sessionId) {
    const session = byId.get(sessionId);
    if (!session || session.project.path !== projectPath) {
      throw new Error('The terminal session is unavailable for the selected project.');
    }
    return session;
  }

  function signalGroup(session, signal = 'SIGHUP') {
    if (!Number.isInteger(session.process?.pid) || session.process.pid <= 0) return;
    try {
      killProcessGroup(session.process.pid, signal);
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }

  function attach(session) {
    session.dataListener = session.process.onData((data) => {
      if (session.discarded || typeof data !== 'string') return;
      session.output = appendBounded(session.output, data, outputLimit);
      emit(Object.freeze({ schemaVersion: 1, type: 'data', sessionId: session.id, data }));
    });
    session.exitListener = session.process.onExit(({ exitCode, signal }) => {
      if (session.discarded) return;
      session.status = 'exited';
      session.exit = {
        code: Number.isInteger(exitCode) ? exitCode : null,
        signal: Number.isInteger(signal) ? signal : null,
      };
      dispose(session.dataListener);
      dispose(session.exitListener);
      session.dataListener = null;
      session.exitListener = null;
      emit(Object.freeze({ schemaVersion: 1, type: 'exited', session: publicSession(session) }));
    });
  }

  function create(projectValue, dimensionsValue) {
    if (closed) throw new Error('The terminal manager is closed.');
    const project = requireProject(projectValue);
    const dimensions = requireTerminalDimensions(dimensionsValue);
    let shell;
    let shellError = null;
    try {
      shell = resolveAccountShell({ platform, user: userInfo(), environment });
    } catch (error) {
      shell = Object.freeze({ path: null, name: 'unavailable', args: [] });
      shellError = error;
    }
    const session = {
      id: `terminal_${createId()}`,
      project,
      shell,
      status: 'running',
      cols: dimensions.cols,
      rows: dimensions.rows,
      output: '',
      exit: null,
      error: null,
      process: null,
      dataListener: null,
      exitListener: null,
      discarded: false,
    };
    byProject.set(project.path, session);
    byId.set(session.id, session);
    if (shellError !== null) {
      session.status = 'failed';
      session.error = shellError?.message ?? String(shellError);
      return session;
    }
    try {
      session.process = spawn(shell.path, shell.args, {
        name: 'xterm-256color',
        cols: dimensions.cols,
        rows: dimensions.rows,
        cwd: project.path,
        env: cleanEnvironment(environment),
      });
      attach(session);
    } catch (error) {
      session.status = 'failed';
      session.error = error?.message ?? String(error);
    }
    return session;
  }

  function discard(session, { terminate = true } = {}) {
    if (session.discarded) return;
    session.discarded = true;
    if (terminate && ['running', 'terminating'].includes(session.status)) signalGroup(session);
    dispose(session.dataListener);
    dispose(session.exitListener);
    session.dataListener = null;
    session.exitListener = null;
    byProject.delete(session.project.path);
    byId.delete(session.id);
  }

  return Object.freeze({
    ensure(projectValue, dimensionsValue) {
      const project = requireProject(projectValue);
      const existing = byProject.get(project.path);
      return publicSession(existing ?? create(project, dimensionsValue));
    },
    current(projectPath) {
      const session = byProject.get(projectPath);
      return session ? publicSession(session) : null;
    },
    write(projectPath, sessionId, data) {
      const session = owned(projectPath, sessionId);
      if (session.status !== 'running') throw new Error('The terminal is not accepting input.');
      session.process.write(requireInput(data));
      return true;
    },
    resize(projectPath, sessionId, dimensionsValue) {
      const session = owned(projectPath, sessionId);
      if (session.status !== 'running') throw new Error('The terminal cannot be resized now.');
      const dimensions = requireTerminalDimensions(dimensionsValue);
      session.process.resize(dimensions.cols, dimensions.rows);
      session.cols = dimensions.cols;
      session.rows = dimensions.rows;
      return publicSession(session);
    },
    terminate(projectPath, sessionId) {
      const session = owned(projectPath, sessionId);
      if (session.status !== 'running') throw new Error('The terminal is not running.');
      session.status = 'terminating';
      signalGroup(session);
      emit(Object.freeze({ schemaVersion: 1, type: 'terminating', session: publicSession(session) }));
      return publicSession(session);
    },
    restart(projectValue, sessionId, dimensionsValue) {
      const project = requireProject(projectValue);
      const session = owned(project.path, sessionId);
      if (!['exited', 'failed'].includes(session.status)) {
        throw new Error('Only an exited or failed terminal can be restarted.');
      }
      discard(session, { terminate: false });
      return publicSession(create(project, dimensionsValue));
    },
    hasLive(projectPath) {
      return ['running', 'terminating'].includes(byProject.get(projectPath)?.status);
    },
    liveProjects() {
      return [...byProject.values()]
        .filter((session) => ['running', 'terminating'].includes(session.status))
        .map((session) => session.project.path);
    },
    discardProject(projectPath) {
      const session = byProject.get(projectPath);
      if (session) discard(session);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const session of [...byProject.values()]) discard(session);
      listeners.clear();
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A terminal listener is required.');
      if (closed) throw new Error('The terminal manager is closed.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
