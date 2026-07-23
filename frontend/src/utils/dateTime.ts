const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTime(value: string): string {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(value)
  const date = new Date(hasTimeZone ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}
