import { Readable, Duplex } from 'node:stream'
import { Buffer } from 'node:buffer'
import { PathLike } from 'node:fs'

import * as errors from './errors'
import * as ast from './ast'
import evalCommand from './eval'


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

  async run() {
    const stdio = await evalCommand(this.node)
    stdio.stdin.end()

    const stdout = await readStream(stdio.stdout)
    const stderr = await readStream(stdio.stderr)

    let exitCode = null

    try {
      await stdio.terminated
      exitCode = 0
    }
    catch (err) {
      if (err instanceof errors.NonZeroExitCode) {
        exitCode = err.code
      }
      else {
        console.error(err)
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
}

export const command = (executable: string, ...args: string[]) =>
  new CommandBuilder({ type: 'spawn', executable, args })
