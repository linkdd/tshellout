import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import command from '../src/index'
import { CommandBuilder } from '../src/builder'

const snapshotCommand = (cmd: CommandBuilder) => {
  expect(cmd.toShellScript()).toMatchSnapshot()
}

const testCommand = async (
  cmd: CommandBuilder,
  block: (
    res: Awaited<ReturnType<CommandBuilder['run']>>
  ) => void | Promise<void>
): Promise<void> => {
  const resFromEval = await cmd.run()
  await block(resFromEval)

  const shellScript = cmd.toShellScript()
  expect(shellScript).toMatchSnapshot()

  const resFromShell = await command(shellScript).run()
  try {
    await block(resFromShell)
  } catch (error) {
    console.error(
      'Bad shell script:\n',
      shellScript,
      '\nexitCode:',
      resFromShell.exitCode,
      '\nstdout:',
      resFromShell.stdout.toString(),
      '\nstderr:',
      resFromShell.stderr.toString(),
      '\n',
      String(error)
    )
    throw error
  }
}

describe('command runner', () => {
  it('should return stdout', async () => {
    const cmd = command('echo', 'hello world')

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('hello world')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should return stderr', async () => {
    const cmd = command('>&2 echo', 'hello world')

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('')
      expect(res.stderr.toString().trim()).toEqual('hello world')
    })
  })

  it('should return exit code', async () => {
    const cmd = command('exit', '42')

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(42)
      expect(res.stdout.toString().trim()).toEqual('')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should pipe stdout to stdin', async () => {
    const s = 'hello world'

    const cmd = command('echo', s)
      .pipe(command('tr', '-d', '\\r'))
      .pipe(command('tr', '-d', '\\n'))
      .pipe(command('wc', '-c'))

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual(`${s.length}`)
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should chain commands with &&', async () => {
    const cmd = command('printf', 'hello ').and(command('printf', 'world'))

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('hello world')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should short-circuit on failure with &&', async () => {
    const cmd = command('exit', '1').and(command('echo', 'hello world'))

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(1)
      expect(res.stdout.toString().trim()).toEqual('')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should chain commands with ||', async () => {
    const cmd = command('exit', '1').or(command('echo', 'hello world'))

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('hello world')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should short-circuit on success with ||', async () => {
    const cmd = command('echo', 'hello world').or(command('exit', '1'))

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('hello world')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })

  it('should redirect stdout to a file', async () => {
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tshellout-test-stdout-')
    )
    const filepath = path.join(folder, 'stdout.txt')
    const cmd = command('echo', 'hello world').redirectStdout(filepath)

    try {
      await testCommand(cmd, async (res) => {
        expect(res.exitCode).toEqual(0)
        expect(res.stdout.toString().trim()).toEqual('')
        expect(res.stderr.toString().trim()).toEqual('')

        const content = await fs.readFile(filepath)
        expect(content.toString().trim()).toEqual('hello world')
      })
    } finally {
      await fs.rm(folder, { recursive: true, force: true })
    }
  })

  it('should redirect stderr to a file', async () => {
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tshellout-test-stderr-')
    )
    const filepath = path.join(folder, 'stderr.txt')
    const cmd = command('>&2 echo', 'hello world').redirectStderr(filepath)

    try {
      await testCommand(cmd, async (res) => {
        expect(res.exitCode).toEqual(0)
        expect(res.stdout.toString().trim()).toEqual('')
        expect(res.stderr.toString().trim()).toEqual('')

        const content = await fs.readFile(filepath)
        expect(content.toString().trim()).toEqual('hello world')
      })
    } finally {
      await fs.rm(folder, { recursive: true, force: true })
    }
  })

  it('should redirect a file to stdin', async () => {
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tshellout-test-stdin-')
    )
    const filepath = path.join(folder, 'stdin.txt')

    try {
      await fs.writeFile(filepath, 'hello world\n')

      const cmd = command('cat').redirectStdin(filepath)
      await testCommand(cmd, (res) => {
        expect(res.exitCode).toEqual(0)
        expect(res.stdout.toString().trim()).toEqual('hello world')
        expect(res.stderr.toString().trim()).toEqual('')
      })
    } finally {
      await fs.rm(folder, { recursive: true, force: true })
    }
  })

  it('should write to stdin', async () => {
    const cmd = command('cat').writeStdin(Buffer.from('hello world\n'))

    await testCommand(cmd, (res) => {
      expect(res.exitCode).toEqual(0)
      expect(res.stdout.toString().trim()).toEqual('hello world')
      expect(res.stderr.toString().trim()).toEqual('')
    })
  })
})

describe('command template literal', () => {
  it('shell-escapes interpolated strings', () => {
    snapshotCommand(command`echo ${'hello world'}`)
  })

  it('inserts interpolated commands literally', () => {
    const innerCmd = command`exit 0`
    const cmd = command`echo Running command: ${innerCmd}`
    snapshotCommand(cmd)
  })

  it('omits interpolated null | undefined', () => {
    snapshotCommand(command`echo ${null} hi`)
    snapshotCommand(command`echo ${undefined} bye`)
  })
})
