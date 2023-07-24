import { Readable, Writable, PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

import * as errors from './errors'
import { Command } from './ast'

export interface Stdio {
  stdin: Writable,
  stdout: Readable,
  stderr: Readable,
  terminated: Promise<void>,
}

const quote = (s: string): string => {
  if ((/["\s]/).test(s) && !(/'/).test(s)) {
    return "'" + s.replace(/(['\\])/g, '\\$1') + "'"
  }

  if ((/["'\s]/).test(s)) {
    return '"' + s.replace(/(["\\$`!])/g, '\\$1') + '"'
  }

  return s.replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}])/g, '$1\\$2')
}

const evalCommand = async (node: Command): Promise<Stdio> => {
  switch (node.type) {
    case 'spawn': {
      const child = spawn(
        node.executable,
        node.args.map(quote),
        {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      const terminated = new Promise<void>((resolve, reject) => {
        child.on('close', (code, signal) => {
          if (code !== null) {
            if (code === 0) {
              resolve()
            }
            else {
              reject(new errors.NonZeroExitCode(code))
            }
          }
          else {
            reject(new errors.ProcessTerminated(signal!))
          }
        })
      })

      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        terminated,
      }
    }

    case 'pipe': {
      const lhs = await evalCommand(node.lhs)
      const rhs = await evalCommand(node.rhs)

      lhs.stdout.pipe(rhs.stdin, { end: false })

      const stderr = new PassThrough()
      lhs.stderr.pipe(stderr, { end: false })

      const terminated = lhs.terminated
        .finally(() => {
          rhs.stdin.end()
          rhs.stderr.pipe(stderr, { end: false })

          return rhs.terminated
        })
        .finally(() => {
          stderr.end()
        })

      return {
        stdin: lhs.stdin,
        stdout: rhs.stdout,
        stderr,
        terminated,
      }
    }

    case 'and': {
      const lhs = await evalCommand(node.lhs)

      const stdout = new PassThrough()
      const stderr = new PassThrough()

      lhs.stdout.pipe(stdout, { end: false })
      lhs.stderr.pipe(stderr, { end: false })

      const terminated = lhs.terminated
        .then(() => evalCommand(node.rhs))
        .then((rhs) => {
          rhs.stdin.end()
          rhs.stdout.pipe(stdout, { end: false })
          rhs.stderr.pipe(stderr, { end: false })

          return rhs.terminated
        })
        .finally(() => {
          stdout.end()
          stderr.end()
        })

      return {
        stdin: lhs.stdin,
        stdout,
        stderr,
        terminated,
      }
    }

    case 'or': {
      const lhs = await evalCommand(node.lhs)

      const stdout = new PassThrough()
      const stderr = new PassThrough()

      lhs.stdout.pipe(stdout, { end: false })
      lhs.stderr.pipe(stderr, { end: false })

      const terminated = lhs.terminated
        .catch(() =>
          evalCommand(node.rhs)
            .then((rhs) => {
              rhs.stdin.end()
              rhs.stdout.pipe(stdout, { end: false })
              rhs.stderr.pipe(stderr, { end: false })

              return rhs.terminated
            })
        )
        .finally(() => {
          stdout.end()
          stderr.end()
        })

      return {
        stdin: lhs.stdin,
        stdout,
        stderr,
        terminated,
      }
    }

    case 'redirectStdout': {
      const cmd = await evalCommand(node.cmd)

      const target = fs.createWriteStream(node.path)
      cmd.stdout.pipe(target, { end: false })

      const terminated = cmd.terminated
        .finally(() => target.end())

      return {
        stdin: cmd.stdin,
        stdout: Readable.from(''),
        stderr: cmd.stderr,
        terminated,
      }
    }

    case 'redirectStderr': {
      const cmd = await evalCommand(node.cmd)

      const target = fs.createWriteStream(node.path)
      cmd.stderr.pipe(target, { end: false })

      const terminated = cmd.terminated
        .finally(() => target.end())

      return {
        stdin: cmd.stdin,
        stdout: cmd.stdout,
        stderr: Readable.from(''),
        terminated,
      }
    }

    case 'redirectStdin': {
      const cmd = await evalCommand(node.cmd)

      const source = fs.createReadStream(node.path)
      for await (const chunk of source) {
        cmd.stdin.write(chunk)
      }

      return cmd
    }

    case 'writeStdin': {
      const cmd = await evalCommand(node.cmd)
      cmd.stdin.write(node.data)
      return cmd
    }

    default:
      throw new Error('Unknown node type')
  }
}

export default evalCommand
