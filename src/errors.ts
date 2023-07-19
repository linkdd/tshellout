export class TShellOutError extends Error {}

export class NonZeroExitCode extends TShellOutError {
  code: number

  constructor(code: number) {
    super(`Process exited with non-zero error code: ${code}`)

    this.code = code
  }
}

export class ProcessTerminated extends TShellOutError {
  constructor(signal: NodeJS.Signals) {
    super(`Process was terminated by signal: ${signal}`)
  }
}
