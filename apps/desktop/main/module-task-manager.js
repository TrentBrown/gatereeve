// @ts-check

import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import {
  mapCommandCompletion,
  parseCommandStructuredOutput,
} from '../resources/protocol/module-runtime.js';
import { validateModuleDefinition } from '../resources/protocol/modules.js';
import {
  requireTerminalDimensions,
  TERMINAL_INPUT_LIMIT,
  TERMINAL_OUTPUT_LIMIT,
} from './terminal-manager.js';

const TERMINATION_GRACE_MS = 2_000;

function requireProject(project) {
  if (!project || typeof project !== 'object' || !isAbsolute(project.path) || !project.name) {
    throw new TypeError('A trusted saved project is required.');
  }
  return { path: project.path, name: project.name };
}

function inside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function appendBounded(current, chunk, limit) {
  const next = `${current}${chunk}`;
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function environment(value) {
  const result = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (typeof item === 'string') result[key] = item;
  }
  result.TERM = 'xterm-256color';
  result.COLORTERM = 'truecolor';
  return result;
}

function publicSession(session) {
  return Object.freeze({
    schemaVersion: 1,
    id: session.id,
    kind: 'module-task',
    name: session.module.label,
    moduleId: session.module.id,
    moduleVersion: session.module.version,
    moduleDigest: session.module.digest,
    attemptId: session.context.attemptId,
    gateId: session.context.gateId,
    projectPath: session.project.path,
    projectName: session.project.name,
    status: session.status,
    cols: session.cols,
    rows: session.rows,
    output: session.output,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    exit: session.exit === null ? null : { ...session.exit },
    result: session.result === null ? null : structuredClone(session.result),
    structuredOutput: session.structuredOutput === null ? null : structuredClone(session.structuredOutput),
    error: session.error,
  });
}

function dispose(value) {
  try { value?.dispose?.(); } catch { /* Listener may already be gone. */ }
}

async function commandLocation(projectPath, module) {
  validateModuleDefinition(module);
  if (module.run?.kind !== 'command') throw new TypeError('A command module is required.');
  const root = await realpath(projectPath);
  const cwd = module.run.workingDirectory === 'repository'
    ? root
    : resolve(root, module.run.workingDirectory);
  if (!inside(root, cwd)) throw new Error('Module command working directory escapes the repository.');
  const cwdInfo = await lstat(cwd);
  if (!cwdInfo.isDirectory() || cwdInfo.isSymbolicLink() || !inside(root, await realpath(cwd))) {
    throw new Error('Module command working directory must be a real repository directory.');
  }
  const executable = isAbsolute(module.run.executable) || !module.run.executable.includes('/')
    ? module.run.executable
    : resolve(root, module.run.executable);
  if (!isAbsolute(module.run.executable) && module.run.executable.includes('/') && !inside(root, executable)) {
    throw new Error('Module command executable escapes the repository.');
  }
  return { root, cwd, executable };
}

export function createModuleTaskManager({
  spawn,
  killProcessGroup,
  environment: sourceEnvironment = process.env,
  createId = randomUUID,
  now = () => new Date().toISOString(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  outputLimit = TERMINAL_OUTPUT_LIMIT,
} = {}) {
  if (typeof spawn !== 'function') throw new TypeError('A PTY spawn adapter is required.');
  if (typeof killProcessGroup !== 'function') throw new TypeError('A process-group termination adapter is required.');
  const byId = new Map();
  const listeners = new Set();
  let closed = false;

  function emit(event) {
    for (const listener of listeners) listener(event);
  }

  function owned(projectPath, sessionId) {
    const session = byId.get(sessionId);
    if (!session || session.project.path !== projectPath || session.discarded) {
      throw new Error('The module task session is unavailable for the selected project.');
    }
    return session;
  }

  function signal(session, name = 'SIGHUP') {
    if (!Number.isInteger(session.process?.pid) || session.process.pid < 1) return;
    try { killProcessGroup(session.process.pid, name); }
    catch (error) { if (error?.code !== 'ESRCH') throw error; }
  }

  function finish(session, { exitCode = null, exitSignal = null } = {}) {
    if (session.finishedAt !== null) return;
    if (session.timer !== null) clearTimer(session.timer);
    if (session.killTimer !== null) clearTimer(session.killTimer);
    session.timer = null;
    session.killTimer = null;
    session.exit = {
      code: Number.isInteger(exitCode) ? exitCode : null,
      signal: exitSignal === 0 ? null : exitSignal ?? null,
    };
    session.result = mapCommandCompletion({
      exitCode: session.exit.code,
      signal: session.exit.signal,
      timedOut: session.timedOut,
      cancelled: session.cancelled,
      observed: Boolean(session.module.observe),
    });
    session.status = session.result.attemptStatus;
    session.structuredOutput = parseCommandStructuredOutput(session.output);
    session.finishedAt = now();
    dispose(session.dataListener);
    dispose(session.exitListener);
    session.dataListener = null;
    session.exitListener = null;
    emit({ schemaVersion: 1, type: 'finished', session: publicSession(session) });
  }

  return Object.freeze({
    async start(projectValue, moduleValue, dimensionsValue, contextValue = {}) {
      if (closed) throw new Error('The module task manager is closed.');
      const project = requireProject(projectValue);
      const module = structuredClone(moduleValue);
      const dimensions = requireTerminalDimensions(dimensionsValue);
      const location = await commandLocation(project.path, module);
      const context = {
        attemptId: typeof contextValue.attemptId === 'string' ? contextValue.attemptId : null,
        gateId: typeof contextValue.gateId === 'string' ? contextValue.gateId : null,
      };
      const session = {
        id: `module_task_${createId()}`,
        project,
        module,
        context,
        status: 'running',
        cols: dimensions.cols,
        rows: dimensions.rows,
        output: '',
        startedAt: now(),
        finishedAt: null,
        exit: null,
        result: null,
        structuredOutput: null,
        error: null,
        cancelled: false,
        timedOut: false,
        process: null,
        timer: null,
        killTimer: null,
        dataListener: null,
        exitListener: null,
        discarded: false,
      };
      byId.set(session.id, session);
      try {
        session.process = spawn(location.executable, module.run.args, {
          name: 'xterm-256color',
          cols: dimensions.cols,
          rows: dimensions.rows,
          cwd: location.cwd,
          env: environment(sourceEnvironment),
        });
        session.dataListener = session.process.onData((data) => {
          if (session.discarded || session.finishedAt !== null || typeof data !== 'string') return;
          session.output = appendBounded(session.output, data, outputLimit);
          emit({
            schemaVersion: 1,
            type: 'data',
            sessionId: session.id,
            data: data.length <= outputLimit ? data : data.slice(-outputLimit),
          });
        });
        session.exitListener = session.process.onExit(({ exitCode, signal: exitSignal }) => {
          if (!session.discarded) finish(session, { exitCode, exitSignal });
        });
        session.timer = setTimer(() => {
          if (session.finishedAt !== null || session.discarded) return;
          session.timer = null;
          session.timedOut = true;
          session.status = 'terminating';
          signal(session, 'SIGHUP');
          session.killTimer = setTimer(() => {
            session.killTimer = null;
            if (session.finishedAt === null && !session.discarded) signal(session, 'SIGKILL');
          }, TERMINATION_GRACE_MS);
          emit({ schemaVersion: 1, type: 'terminating', session: publicSession(session) });
        }, module.run.timeoutSeconds * 1_000);
      } catch (error) {
        session.status = 'failed';
        session.error = error?.message ?? String(error);
        session.result = { attemptStatus: 'failed', outcome: 'FAIL', reason: 'Command could not be started' };
        session.finishedAt = now();
      }
      const value = publicSession(session);
      emit({ schemaVersion: 1, type: session.status === 'failed' ? 'finished' : 'started', session: value });
      return value;
    },
    list(projectPath) {
      return [...byId.values()].filter((session) => (
        session.project.path === projectPath && !session.discarded
      )).map(publicSession);
    },
    current(projectPath, sessionId) {
      return publicSession(owned(projectPath, sessionId));
    },
    write(projectPath, sessionId, data) {
      const session = owned(projectPath, sessionId);
      if (session.status !== 'running') throw new Error('The module task is not accepting input.');
      if (typeof data !== 'string' || data.length === 0 || data.length > TERMINAL_INPUT_LIMIT) {
        throw new TypeError('Module task input is invalid.');
      }
      session.process.write(data);
      return true;
    },
    resize(projectPath, sessionId, dimensionsValue) {
      const session = owned(projectPath, sessionId);
      const dimensions = requireTerminalDimensions(dimensionsValue);
      if (session.status !== 'running') throw new Error('The module task cannot be resized now.');
      session.process.resize(dimensions.cols, dimensions.rows);
      session.cols = dimensions.cols;
      session.rows = dimensions.rows;
      return publicSession(session);
    },
    cancel(projectPath, sessionId) {
      const session = owned(projectPath, sessionId);
      if (session.status !== 'running') throw new Error('The module task is not running.');
      session.cancelled = true;
      session.status = 'terminating';
      if (session.timer !== null) clearTimer(session.timer);
      session.timer = null;
      signal(session, 'SIGHUP');
      session.killTimer = setTimer(() => {
        session.killTimer = null;
        if (session.finishedAt === null && !session.discarded) signal(session, 'SIGKILL');
      }, TERMINATION_GRACE_MS);
      const value = publicSession(session);
      emit({ schemaVersion: 1, type: 'terminating', session: value });
      return value;
    },
    liveProjects() {
      return [...new Set([...byId.values()].filter((session) => (
        ['running', 'terminating'].includes(session.status)
      )).map((session) => session.project.path))];
    },
    discardProject(projectPath) {
      for (const session of [...byId.values()].filter((item) => item.project.path === projectPath)) {
        session.discarded = true;
        if (['running', 'terminating'].includes(session.status)) {
          signal(session, 'SIGHUP');
          signal(session, 'SIGKILL');
        }
        if (session.timer !== null) clearTimer(session.timer);
        if (session.killTimer !== null) clearTimer(session.killTimer);
        dispose(session.dataListener);
        dispose(session.exitListener);
        byId.delete(session.id);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const projectPath of [...new Set([...byId.values()].map((item) => item.project.path))]) {
        this.discardProject(projectPath);
      }
      listeners.clear();
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A module task listener is required.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
