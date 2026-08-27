// @ts-check

import {
  IPC_CHANNELS,
  requireArtifactRequest,
  requireCopyText,
  requireDesktopState,
  requireDetailRequest,
  requireNotificationsEnabled,
  requireSelectedAgents,
  requireSessionDetail,
  requireSessionId,
  requireSessionInventory,
  requireWorktreePath,
} from '../shared/contracts.js';
import { validateDetail, validateSnapshot } from '../resources/protocol/snapshot.js';
import { RENDERER_URL } from './window.js';

function validatedState(value) {
  const state = requireDesktopState(value);
  if (state.snapshot !== null) validateSnapshot(state.snapshot);
  return state;
}

export function isTrustedRenderer(event) {
  return event.senderFrame === event.sender?.mainFrame
    && event.senderFrame?.url === RENDERER_URL;
}

export function registerDesktopIpc({
  ipcMain,
  coordinator,
  pickWorktree,
  openPath,
  revealPath,
  copyText,
  windows,
}) {
  function trusted(event) {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer IPC request refused.');
  }
  function noArguments(event, values) {
    trusted(event);
    if (values.length !== 0) throw new Error('This operation does not accept renderer arguments.');
  }

  ipcMain.handle(IPC_CHANNELS.getState, async (event, ...values) => {
    noArguments(event, values);
    return validatedState(coordinator.current());
  });
  ipcMain.handle(IPC_CHANNELS.chooseWorktree, async (event, ...values) => {
    noArguments(event, values);
    const path = await pickWorktree();
    return validatedState(path === null ? coordinator.current() : await coordinator.open(path));
  });
  ipcMain.handle(IPC_CHANNELS.openRecent, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Recent worktree selection requires one path.');
    const path = requireWorktreePath(values[0]);
    if (!coordinator.current().preferences.recentWorktrees.includes(path)) {
      throw new Error('The requested path is not a recent worktree.');
    }
    return validatedState(await coordinator.open(path));
  });
  ipcMain.handle(IPC_CHANNELS.refresh, async (event, ...values) => {
    noArguments(event, values);
    return validatedState(await coordinator.refresh());
  });
  ipcMain.handle(IPC_CHANNELS.recheckSetup, async (event, ...values) => {
    noArguments(event, values);
    return validatedState(await coordinator.recheckSetup());
  });
  ipcMain.handle(IPC_CHANNELS.setNotificationsEnabled, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Notification preference requires one boolean.');
    return validatedState(await coordinator.setNotificationsEnabled(
      requireNotificationsEnabled(values[0]),
    ));
  });
  ipcMain.handle(IPC_CHANNELS.setSelectedAgents, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Agent selection requires one list.');
    return validatedState(await coordinator.setSelectedAgents(requireSelectedAgents(values[0])));
  });
  ipcMain.handle(IPC_CHANNELS.readDetail, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Named read requires one request.');
    const request = requireDetailRequest(values[0]);
    return validateDetail(await coordinator.read(request.kind, request.id));
  });
  ipcMain.handle(IPC_CHANNELS.listSession, async (event, ...values) => {
    noArguments(event, values);
    return requireSessionInventory(await coordinator.listSession());
  });
  ipcMain.handle(IPC_CHANNELS.readSession, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Session read requires one exact ID.');
    return requireSessionDetail(await coordinator.readSession(requireSessionId(values[0])));
  });
  ipcMain.handle(IPC_CHANNELS.copyText, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Clipboard write requires one string.');
    copyText(requireCopyText(values[0]));
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.openArtifact, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Open artifact requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    const result = await openPath(coordinator.artifact(artifactId).absolutePath);
    if (typeof result === 'string' && result.length > 0) throw new Error(result);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.revealArtifact, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Reveal artifact requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    revealPath(coordinator.artifact(artifactId).absolutePath);
    return true;
  });

  return coordinator.subscribe((state) => {
    const value = validatedState(state);
    for (const window of windows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.stateChanged, value);
    }
  });
}
