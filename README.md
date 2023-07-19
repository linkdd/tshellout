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
import command from 'tshellout'

const cmd = command('echo', 'hello world')
const res = await cmd.run()

console.log(res.exitCode)
console.log(res.stdout.toString())
console.log(res.stderr.toString())
```

More examples:

```typescript
// echo hello world | tr -d \r | tr -d \n | wc -c
const cmd = command('echo', 'hello world')
  .pipe(command('tr', '-d', '\\r'))
  .pipe(command('tr', '-d', '\\n'))
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
// echo hello world > greet.txt
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

## :page_facing_up: License

This project is released under the terms of the [MIT License](./LICENSE.txt).
