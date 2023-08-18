import { Readable, Duplex } from 'node:stream'
import { Buffer } from 'node:buffer'
import { PathLike } from 'node:fs'

import * as errors from './errors'
import * as ast from './ast'
import evalCommand, { quote } from './eval'


const readStream = async (stream: Readable): Promise<Buffer> => {
  const chunks = []

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export class CommandBuilder {
  private node: ast.Command

  constructor(node: ast.Command) {
    this.node = node
  }

  pipe(rhs: CommandBuilder) {
    return new CommandBuilder({ type: 'pipe', lhs: this.node, rhs: rhs.node })
  }

  and(rhs: CommandBuilder) {
    return new CommandBuilder({ type: 'and', lhs: this.node, rhs: rhs.node })
  }

  or(rhs: CommandBuilder) {
    return new CommandBuilder({ type: 'or', lhs: this.node, rhs: rhs.node })
  }

  redirectStdout(path: PathLike) {
    return new CommandBuilder({ type: 'redirectStdout', cmd: this.node, path })
  }

  redirectStderr(path: PathLike) {
    return new CommandBuilder({ type: 'redirectStderr', cmd: this.node, path })
  }

  redirectStdin(path: PathLike) {
    return new CommandBuilder({ type: 'redirectStdin', cmd: this.node, path })
  }

  writeStdin(data: Buffer) {
    return new CommandBuilder({ type: 'writeStdin', cmd: this.node, data })
  }

  private async eval(options: {
    capture: { stdout: boolean, stderr: boolean },
    raiseOnError: boolean,
  }) {
    const stdio = await evalCommand(this.node)
    stdio.stdin.end()

    const stdout = (
      options.capture.stdout
      ? await readStream(stdio.stdout)
      : (stdio.stdout.pipe(process.stdout), Buffer.from(''))
    )
    const stderr = (
      options.capture.stderr
      ? await readStream(stdio.stderr)
      : (stdio.stderr.pipe(process.stderr), Buffer.from(''))
    )

    let exitCode = null

    try {
      await stdio.terminated
      exitCode = 0
    }
    catch (err) {
      if (err instanceof errors.TShellOutError && !options.raiseOnError) {
        if (err instanceof errors.NonZeroExitCode) {
          exitCode = err.code
        }
        else {
          console.error(err)
        }
      }
      else {
        throw err
      }
    }
    finally {
      if (stdio.stdout instanceof Duplex) {
        stdio.stdout.end()
      }

      if (stdio.stderr instanceof Duplex) {
        stdio.stderr.end()
      }
    }

    return {
      exitCode,
      stdout,
      stderr,
    }
  }

  async run(options?: {
    capture: { stdout: boolean, stderr: boolean },
    raiseOnError: boolean,
  }) {
    return await this.eval({
      capture: {
        stdout: options?.capture?.stdout ?? true,
        stderr: options?.capture?.stderr ?? true,
      },
      raiseOnError: options?.raiseOnError ?? false
    })
  }

  async exec(options?: {
    capture: { stdout: boolean, stderr: boolean },
    raiseOnError: boolean,
  }) {
    return await this.eval({
      capture: {
        stdout: options?.capture?.stdout ?? false,
        stderr: options?.capture?.stderr ?? false,
      },
      raiseOnError: options?.raiseOnError ?? true
    })
  }
}


export const command = (executable: string, ...args: string[]) =>
  new CommandBuilder({ type: 'spawn', executable, args })


const makeSource = (template: TemplateStringsArray, args: unknown[]): string =>
  template.map((s: string, i: number) => {
    const arg = args[i]

    if (arg === null || arg === undefined) {
      return s
    }
    else if (typeof arg === 'string') {
      return `${s}${quote(arg)}`
    }
    else if (typeof arg === 'number' || typeof arg === 'boolean') {
      return `${s}${arg}`
    }
    else {
      throw new TypeError(
        `Unexpected template argument of type ${typeof arg}`
      )
    }
  }).join('')


export const script = {
  posix: (template: TemplateStringsArray, ...args: unknown[]) => {
    const src = makeSource(template, args)
    return command('sh', '-').writeStdin(Buffer.from(src))
  },
  powershell: (template: TemplateStringsArray, ...args: unknown[]) => {
    const src = makeSource(template, args)
    return command('PowerShell', '-Command', '-').writeStdin(Buffer.from(src))
  },
}
