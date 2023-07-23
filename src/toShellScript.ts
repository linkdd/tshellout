import { Command } from './ast'

function unreachable(x: never): never {
  throw new Error(`Unreachable: ${JSON.stringify(x)}`)
}

export function toShellScript(command: Command): string {
  switch (command.type) {
    case 'spawn':
      return [command.executable, ...command.args.map(quote)].join(' ')
    case 'pipe':
      return `${toShellScript(command.lhs)} | ${toShellScript(command.rhs)}`
    case 'and':
      return `(${toShellScript(command.lhs)}) && ${toShellScript(command.rhs)}`
    case 'or':
      return `(${toShellScript(command.lhs)}) || ${toShellScript(command.rhs)}`
    case 'redirectStdout':
      return `(${toShellScript(command.cmd)}) > ${quote(String(command.path))}`
    case 'redirectStderr':
      return `(${toShellScript(command.cmd)}) 2> ${quote(String(command.path))}`
    case 'redirectStdin':
      return `(${toShellScript(command.cmd)}) < ${quote(String(command.path))}`
    case 'writeStdin': {
      // Not sure how safe it is to pass binary data through quoting, etc.
      // Instead, pass as base64 decoded by the shell.
      const dataBase64 = command.data.toString('base64')
      return `${toShellScript(
        command.cmd
      )} <<< "$(base64 -d <<< ${dataBase64})"`
    }
    default:
      unreachable(command)
  }
}

/** Makes string `s` safe to interpolate as a shell argument. */
export function quote(s: string) {
  if (s === '') return `''`
  if (!/[^%+,-./:=@_0-9A-Za-z]/.test(s)) return s
  return `'` + s.replace(/'/g, `'"'`) + `'`
}
