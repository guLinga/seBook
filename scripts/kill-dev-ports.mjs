import { execFileSync } from 'node:child_process'

const PORTS = [5173, 8787]

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', windowsHide: true })
}

function ancestorPids(pid) {
  const set = new Set([pid])
  let current = pid
  while (current > 0) {
    const parent = parentPid(current)
    if (!parent || set.has(parent)) break
    set.add(parent)
    current = parent
  }
  return set
}

function parentPid(pid) {
  if (process.platform === 'win32') {
    const out = run('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").ParentProcessId`,
    ])
    const value = Number(String(out).trim())
    return Number.isFinite(value) ? value : 0
  }

  const out = run('ps', ['-o', 'ppid=', '-p', String(pid)])
  const value = Number(String(out).trim())
  return Number.isFinite(value) ? value : 0
}

function imageName(pid) {
  if (process.platform === 'win32') {
    const out = run('tasklist', ['/FI', `PID eq ${Number(pid)}`, '/FO', 'CSV', '/NH'])
    return out.match(/^"([^"]+)"/)?.[1]?.toLowerCase() || ''
  }
  const out = run('ps', ['-o', 'comm=', '-p', String(pid)])
  return String(out).trim().toLowerCase()
}

function listeningPids(port) {
  const pids = new Set()

  if (process.platform === 'win32') {
    const output = run('netstat', ['-ano', '-p', 'tcp'])
    for (const line of output.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      if (parts[0] !== 'TCP' || parts.length < 5) continue
      if (!/listen|侦听/i.test(parts[3] || '')) continue
      const localPort = (parts[1] || '').split(':').pop()
      if (localPort !== String(port)) continue
      const pid = Number(parts[4])
      if (pid > 0) pids.add(pid)
    }
    return pids
  }

  try {
    const output = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    for (const line of output.split(/\r?\n/)) {
      const pid = Number(line.trim())
      if (pid > 0) pids.add(pid)
    }
  } catch {
    // 没有占用时 lsof 会非 0 退出
  }
  return pids
}

function isDevProcess(name) {
  if (process.platform === 'win32') return name === 'node.exe' || name === 'cmd.exe'
  return name === 'node' || name.includes('node')
}

function killTree(pid) {
  if (process.platform === 'win32') {
    run('taskkill', ['/PID', String(pid), '/F', '/T'])
    return
  }
  process.kill(pid, 'SIGKILL')
}

const protectedPids = ancestorPids(process.pid)
const killed = new Set()

for (const port of PORTS) {
  let pids
  try {
    pids = listeningPids(port)
  } catch (error) {
    console.warn(`检查端口 ${port} 失败：${error instanceof Error ? error.message : error}`)
    continue
  }

  for (const pid of pids) {
    if (protectedPids.has(pid)) continue

    let top = pid
    let current = pid
    while (true) {
      const parent = parentPid(current)
      if (!parent || protectedPids.has(parent)) break
      const name = imageName(parent)
      if (!isDevProcess(name)) break
      top = parent
      current = parent
    }

    if (killed.has(top)) continue
    killed.add(top)

    try {
      killTree(top)
      console.log(`已结束占用 ${port} 的进程 ${top}`)
    } catch {
      console.log(`端口 ${port} 的进程 ${top} 已不在运行`)
    }
  }
}
