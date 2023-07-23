import { Readable, Duplex } from 'node:stream'
import { Buffer } from 'node:buffer'
import { PathLike } from 'node:fs'

import * as errors from './errors'
import * as ast from './ast'
import evalCommand from './eval'
import { quote, toShellScript } from './toShellScript'

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
    } catch (err) {
      if (err instanceof errors.NonZeroExitCode) {
        exitCode = err.code
      } else {
        console.error(err)
      }
    } finally {
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

  toShellScript(): string {
    return toShellScript(this.node)
  }
}

type CommandTemplateArg =
  /** String arguments will be shell-escaped. */
  | string
  /** Command arguments will be interpolated literally. */
  | CommandBuilder
  /** Null and undefined arguments are omitted entirely. */
  | null
  | undefined

function unexpectedArgToString(arg: unknown): string {
  const constructorName = (
    arg as undefined | { constructor?: { name?: string } }
  )?.constructor?.name
  return `${typeof arg}/${constructorName || 'no constructor'}: ${String(arg)}`
}

function commandFromTaggedTemplateLiteral(
  template: string[],
  ...args: CommandTemplateArg[]
) {
  const executable = template
    .map((str, i) => {
      const arg = args[i]
      if (arg === null || arg === undefined) return str
      if (typeof arg === 'string') return `${str}${quote(arg)}`
      if (arg instanceof CommandBuilder) return `${str}${arg.toShellScript()}`
      else {
        arg satisfies never
        throw new TypeError(
          `Expected command template argument [${i}] to be string, Command, or nullable, but was ${unexpectedArgToString(
            arg
          )}`
        )
      }
    })
    .join(' ')

  return new CommandBuilder({ type: 'spawn', executable, args: [] })
}

function commandFromExecutableAndArgs(
  executable: string,
  ...args: string[]
): CommandBuilder {
  return new CommandBuilder({ type: 'spawn', executable, args })
}

export function command(executable: string, ...args: string[]): CommandBuilder
export function command(
  template: TemplateStringsArray,
  ...args: Array<CommandTemplateArg>
): CommandBuilder
export function command(
  executableOrTemplate: string | TemplateStringsArray,
  ...args: Array<string> | Array<CommandTemplateArg>
): CommandBuilder {
  if (typeof executableOrTemplate === 'string') {
    const stringArgs = args.map((arg, i) => {
      if (typeof arg !== 'string') {
        throw new TypeError(
          `Expected command argument [${i}] to be string, but was ${unexpectedArgToString(
            arg
          )}}`
        )
      }
      return arg
    })
    return commandFromExecutableAndArgs(executableOrTemplate, ...stringArgs)
  } else if (Array.isArray(executableOrTemplate)) {
    return commandFromTaggedTemplateLiteral(executableOrTemplate, ...args)
  } else {
    throw new TypeError(
      `Unexpected executable: ${unexpectedArgToString(executableOrTemplate)}`
    )
  }
}
