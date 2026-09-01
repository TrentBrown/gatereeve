// @ts-check

export async function confirmProjectTerminalTermination(dialog, window, projectName) {
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['Cancel', 'Terminate and Remove'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Terminal is still running',
    message: `Terminate the terminal for ${projectName}?`,
    detail: 'Removing this project from GateReeve will terminate its shell and child processes. Project files will not be removed.',
  });
  return result.response === 1;
}

export async function confirmQuitTerminalTermination(dialog, window, projectCount) {
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['Cancel', 'Terminate and Quit'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Terminals are still running',
    message: projectCount === 1
      ? 'A project terminal is still running.'
      : `${projectCount} project terminals are still running.`,
    detail: 'Quitting GateReeve will terminate each shell and its child processes.',
  });
  return result.response === 1;
}

export function bindTerminalQuitGuard({ app, terminalManager, confirmQuit, cleanup }) {
  let quitAuthorized = false;
  let prompting = false;
  let cleaned = false;

  function cleanOnce() {
    if (cleaned) return;
    cleaned = true;
    cleanup();
  }

  function beforeQuit(event) {
    const liveProjects = terminalManager.liveProjects();
    if (quitAuthorized || liveProjects.length === 0) {
      cleanOnce();
      return;
    }
    event.preventDefault();
    if (prompting) return;
    prompting = true;
    void Promise.resolve(confirmQuit(liveProjects.length))
      .then((confirmed) => {
        prompting = false;
        if (!confirmed) return;
        terminalManager.close();
        quitAuthorized = true;
        app.quit();
      })
      .catch(() => { prompting = false; });
  }

  app.on('before-quit', beforeQuit);
  return () => app.removeListener('before-quit', beforeQuit);
}

export function bindTerminalWindowCloseGuard({ window, terminalManager, confirmQuit }) {
  let closeAuthorized = false;
  let prompting = false;

  function close(event) {
    const liveProjects = terminalManager.liveProjects();
    if (closeAuthorized || liveProjects.length === 0) return;
    event.preventDefault();
    if (prompting) return;
    prompting = true;
    void Promise.resolve(confirmQuit(liveProjects.length))
      .then((confirmed) => {
        prompting = false;
        if (!confirmed) return;
        terminalManager.close();
        closeAuthorized = true;
        window.close();
      })
      .catch(() => { prompting = false; });
  }

  window.on('close', close);
  return () => window.removeListener('close', close);
}
