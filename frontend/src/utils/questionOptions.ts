export function optionKeyFromIndex(index: number): string {
  let remaining = index + 1
  let key = ''

  while (remaining > 0) {
    remaining -= 1
    key = String.fromCharCode(65 + (remaining % 26)) + key
    remaining = Math.floor(remaining / 26)
  }

  return key
}
