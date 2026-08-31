// @ts-check

import {
  IPC_CHANNELS,
  requireArtifactActions,
  requireArtifactOpenRequest,
  requireArtifactRequest,
  requireCopyText,
  requireDesktopState,
  requireDetailRequest,
  requireExternalLink,
  requireNotificationsEnabled,
  requireProjectOrder,
  requireProjectPath,
  requireSelectedAgents,
  requireSessionDetail,
  requireSessionId,
  requireSessionInventory,
  requireUpdateState,
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
  artifactActions,
  updateCoordinator,
  pickProject,
  revealPath,
  copyText,
  openExternal,
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
  ipcMain.handle(IPC_CHANNELS.getUpdateState, async (event, ...values) => {
    noArguments(event, values);
    return requireUpdateState(updateCoordinator.current());
  });
  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (event, ...values) => {
    noArguments(event, values);
    return requireUpdateState(await updateCoordinator.check('manual'));
  });
  ipcMain.handle(IPC_CHANNELS.openUpdateRelease, async (event, ...values) => {
    noArguments(event, values);
    await openExternal(updateCoordinator.releasePage());
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.openExternalLink, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('External link opening requires one URL.');
    await openExternal(requireExternalLink(values[0]));
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.addProject, async (event, ...values) => {
    noArguments(event, values);
    const path = await pickProject();
    return validatedState(path === null ? coordinator.current() : await coordinator.open(path));
  });
  ipcMain.handle(IPC_CHANNELS.activateProject, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Project activation requires one path.');
    const path = requireProjectPath(values[0]);
    if (!coordinator.current().preferences.projectPaths.includes(path)) {
      throw new Error('The requested path is not a saved project.');
    }
    return validatedState(await coordinator.activate(path));
  });
  ipcMain.handle(IPC_CHANNELS.reorderProjects, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Project reordering requires one ordered path list.');
    return validatedState(await coordinator.reorderProjects(requireProjectOrder(values[0])));
  });
  ipcMain.handle(IPC_CHANNELS.removeProject, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Project removal requires one path.');
    return validatedState(await coordinator.removeProject(requireProjectPath(values[0])));
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
  ipcMain.handle(IPC_CHANNELS.getArtifactActions, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Artifact actions require one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    return requireArtifactActions(
      await artifactActions.capabilities(coordinator.artifact(artifactId).absolutePath),
    );
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
    const { artifactId, editorId, remember } = requireArtifactOpenRequest(values[0]);
    return artifactActions.open(
      coordinator.artifact(artifactId).absolutePath,
      editorId,
      remember,
    );
  });
  ipcMain.handle(IPC_CHANNELS.chooseArtifactApplication, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Application selection requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    return artifactActions.chooseAndOpen(coordinator.artifact(artifactId).absolutePath);
  });
  ipcMain.handle(IPC_CHANNELS.saveArtifactAs, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Save As requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    return artifactActions.saveAs(coordinator.artifact(artifactId).absolutePath);
  });
  ipcMain.handle(IPC_CHANNELS.saveArtifactDownloads, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Saving to Downloads requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    await artifactActions.saveToDownloads(coordinator.artifact(artifactId).absolutePath);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.openArtifactGithub, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('GitHub opening requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    return artifactActions.openOnGithub(coordinator.artifact(artifactId).absolutePath);
  });
  ipcMain.handle(IPC_CHANNELS.revealArtifact, async (event, ...values) => {
    trusted(event);
    if (values.length !== 1) throw new Error('Reveal artifact requires one request.');
    const { artifactId } = requireArtifactRequest(values[0]);
    revealPath(coordinator.artifact(artifactId).absolutePath);
    return true;
  });

  const unsubscribeState = coordinator.subscribe((state) => {
    const value = validatedState(state);
    for (const window of windows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.stateChanged, value);
    }
  });
  const unsubscribeUpdates = updateCoordinator.subscribe((state) => {
    const value = requireUpdateState(state);
    for (const window of windows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.updateChanged, value);
    }
  });
  return () => {
    unsubscribeState();
    unsubscribeUpdates();
  };
}
