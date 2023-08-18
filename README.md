# TShellOut

Typescript Shell Out library, to simplify writing and composing shell commands
for NodeJS.

## :sparkles: Features

 - No dependencies
 - Composing commands with pipes (`|`), and sequential operators (`&&`, `||`)
 - Redirecting stdin, stdout and stderr
 - Writing Typescript strings to stdin

## :memo: Usage

Install the package:

```
$ npm i tshellout
```

Then in a script:

```typescript
import { command, script } from 'tshellout'

const cmd = command('echo', 'hello world')
const res = await cmd.run()

console.log(res.exitCode)
console.log(res.stdout.toString())
console.log(res.stderr.toString())
```

More examples:

```typescript
// echo "hello world" | tr -d "\r" | tr -d "\n" | wc -c
const cmd = command('echo', 'hello world')
  .pipe(command('tr', '-d', '"\\r"'))
  .pipe(command('tr', '-d', '"\\n"'))
  .pipe(command('wc', '-c'))
const res = await cmd.run()
```

```typescript
// myscript.sh || exit 1
const cmd = command('myscript.sh')
  .or(command('exit', '1'))
const res = await cmd.run()
```

```typescript
// script-1.sh && script-2.sh
const cmd = command('script-1.sh')
  .and(command('script-2.sh'))
const res = await cmd.run()
```

```typescript
// (script-1.sh || script-2.sh) && script-3.sh
const cmd = command('script-1.sh')
  .or(command('script-2.sh'))
  .and(command('script-3.sh'))
const res = await cmd.run()
```

```typescript
// echo "hello world" > greet.txt
const cmd = command('echo', 'hello world')
  .redirectStdout('greet.txt')
const res = await cmd.run()
```

```typescript
// cat << data.txt
const cmd = command('cat')
  .redirectStdin('data.txt')
const res = await cmd.run()
```

```typescript
// cat <<EOF
// hello world
// EOF
const cmd = command('cat')
  .writeStdin(Buffer.from('hello world\n'))
const res = await cmd.run()
```

We can also execute scripts:

```typescript
const cmd = script.posix`
  set -x
  echo hello
  echo world
`

// equivalent to:

const cmd = command('true')
  .and(command('echo hello'))
  .and(command('echo world'))
```

We can also avoid capturing the output, and raise on errors:

```typescript
await command('echo', 'hello world').exec()
```

Parameters of both `run()` and `exec()` methods can be overridden:

```typescript
class CommandBuilder {
  // ...
  async run(options?: {
    capture: { stdout: boolean, stderr: boolean },
    raiseOnError: boolean,
  }) { /* ... */ }

  async exec(options?: {
    capture: { stdout: boolean, stderr: boolean },
    raiseOnError: boolean,
  }) { /* ... */ }
}
```

The defaults are:

  - `run()`: `{ capture: { stdout: true, stderr: true }, raiseOnError: false }`
  - `exec()`: `{ capture: { stdout: false, stderr: false }, raiseOnError: true }`

## :page_facing_up: License

This project is released under the terms of the [MIT License](./LICENSE.txt).
