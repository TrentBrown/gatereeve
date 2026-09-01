// @ts-check

import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import * as pty from 'node-pty';

export function spawnPty(file, args, options) {
  return pty.spawn(file, args, options);
}

export function accountUserInfo() {
  return userInfo();
}

export function descendantProcessIds(rootPid, processTable) {
  const children = new Map();
  for (const line of String(processTable).split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    if (!children.has(parentPid)) children.set(parentPid, []);
    children.get(parentPid).push(pid);
  }
  const descendants = [];
  const visit = (parentPid) => {
    for (const pid of children.get(parentPid) ?? []) {
      visit(pid);
      descendants.push(pid);
    }
  };
  visit(rootPid);
  return descendants;
}

function sendSignal(pid, value) {
  try {
    process.kill(pid, value);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

export function killPtyProcessGroup(pid, signalName) {
  const result = spawnSync('/bin/ps', ['-axo', 'pid=,ppid='], {
    encoding: 'utf8',
    timeout: 2_000,
    windowsHide: true,
  });
  const descendants = result.status === 0
    ? descendantProcessIds(pid, result.stdout)
    : [];
  sendSignal(-pid, signalName);
  for (const descendantPid of descendants) {
    sendSignal(descendantPid, signalName);
  }
}
