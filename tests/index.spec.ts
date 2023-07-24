import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { command, script } from '../src/index'

const isWindows = os.platform() === 'win32'

describe('command runner', () => {
  it('should return stdout', async () => {
    const cmd = command('echo', 'hello world')
    const res = await cmd.run()

    const expected = isWindows ? `'hello world'` : 'hello world'

    expect(res.exitCode).toEqual(0)
    expect(res.stdout.toString().trim()).toEqual(expected)
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should return stderr', async() => {
    const cmd = command('>&2 echo', 'hello world')
    const res = await cmd.run()

    const expected = isWindows ? `'hello world'` : 'hello world'

    expect(res.exitCode).toEqual(0)
    expect(res.stdout.toString().trim()).toEqual('')
    expect(res.stderr.toString().trim()).toEqual(expected)
  })

  it('should return exit code', async() => {
    const cmd = command('exit', '42')
    const res = await cmd.run()

    expect(res.exitCode).toEqual(42)
    expect(res.stdout.toString().trim()).toEqual('')
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should pipe stdout to stdin', async() => {
    const s = 'hello world'

    const cmd = command('echo', s)
      .pipe(command('tr', '-d', '"\\r"'))
      .pipe(command('tr', '-d', '"\\n"'))
      .pipe(command('wc', '-c'))
    const res = await cmd.run()

    const expected = isWindows ? '13' : '11'

    expect(res.exitCode).toEqual(0)
    expect(res.stdout.toString().trim()).toEqual(expected)
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should chain commands with &&', async() => {
    const cmd = command('echo', 'hello')
      .and(command('echo', 'world'))
    const res = await cmd.run()

    expect(res.exitCode).toEqual(0)
    expect(
      res.stdout.toString()
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .join(' ')
    ).toEqual('hello world')
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should short-circuit on failure with &&', async() => {
    const cmd = command('exit', '1')
      .and(command('echo', 'hello world'))
    const res = await cmd.run()

    expect(res.exitCode).toEqual(1)
    expect(res.stdout.toString().trim()).toEqual('')
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should chain commands with ||', async() => {
    const cmd = command('exit', '1')
      .or(command('echo', 'hello world'))
    const res = await cmd.run()

    const expected = isWindows ? `'hello world'` : 'hello world'

    expect(res.exitCode).toEqual(0)
    expect(res.stdout.toString().trim()).toEqual(expected)
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should short-circuit on success with ||', async() => {
    const cmd = command('echo', 'hello world')
      .or(command('exit', '1'))
    const res = await cmd.run()

    const expected = isWindows ? `'hello world'` : 'hello world'

    expect(res.exitCode).toEqual(0)
    expect(res.stdout.toString().trim()).toEqual(expected)
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should redirect stdout to a file', async() => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tshellout-test-stdout-'))
    const filepath = path.join(folder, 'stdout.txt')

    try {
      const cmd = command('echo', 'hello world').redirectStdout(filepath)
      const res = await cmd.run()

      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('')
      expect(res.stderr.toString().trim()).toEqual('')

      const expected = isWindows ? `'hello world'` : 'hello world'

      const content = await fs.readFile(filepath)
      expect(content.toString().trim()).toEqual(expected)
    }
    finally {
      await fs.rm(folder, { recursive: true, force: true })
    }
  })

  it('should redirect stderr to a file', async() => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tshellout-test-stderr-'))
    const filepath = path.join(folder, 'stderr.txt')

    try {
      const cmd = command('>&2 echo', 'hello world').redirectStderr(filepath)
      const res = await cmd.run()

      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('')
      expect(res.stderr.toString().trim()).toEqual('')

      const expected = isWindows ? `'hello world'` : 'hello world'

      const content = await fs.readFile(filepath)
      expect(content.toString().trim()).toEqual(expected)
    }
    finally {
      await fs.rm(folder, { recursive: true, force: true })
    }
  })

  it('should redirect a file to stdin', async() => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tshellout-test-stdin-'))
    const filepath = path.join(folder, 'stdin.txt')

    try {
      await fs.writeFile(filepath, 'hello world\n')

      const cmd = command('cat').redirectStdin(filepath)
      const res = await cmd.run()

      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('hello world')
      expect(res.stderr.toString().trim()).toEqual('')
    }
    finally {
      await fs.rm(folder, { recursive: true, force: true })
    }
  })

  it('should write to stdin', async() => {
    const cmd = command('cat')
      .writeStdin(Buffer.from('hello world\n'))
    const res = await cmd.run()

    expect(res.exitCode).toEqual(0)
    expect(res.stdout.toString().trim()).toEqual('hello world')
    expect(res.stderr.toString().trim()).toEqual('')
  })

  it('should execute a script', async() => {
    const res = await script`
      echo hello
      echo world
    `.run()

    expect(res.exitCode).toEqual(0)
    expect(
      res.stdout.toString()
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .join(' ')
    ).toEqual('hello world')
    expect(res.stderr.toString().trim()).toEqual('')
  })
})
