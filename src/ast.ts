import { Buffer } from 'node:buffer'
import { PathLike } from 'node:fs'

export type Command =
  | { type: 'spawn'; executable: string; args: string[] }
  | { type: 'pipe'; lhs: Command; rhs: Command }
  | { type: 'and'; lhs: Command; rhs: Command }
  | { type: 'or'; lhs: Command; rhs: Command }
  | { type: 'redirectStdout'; cmd: Command; path: PathLike }
  | { type: 'redirectStderr'; cmd: Command; path: PathLike }
  | { type: 'redirectStdin'; cmd: Command; path: PathLike }
  | { type: 'writeStdin'; cmd: Command; data: Buffer }
