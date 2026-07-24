import dayjs, { type Dayjs } from 'dayjs'

const TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/u

/**
 * 后端统一使用“UTC、无时区后缀”的 datetime。DatePicker 使用浏览器本地时间，
 * 提交前先换算成同一时刻的 UTC，再移除后端契约不使用的 Z 后缀。
 */
export function toUtcNaiveDateTime(value: Dayjs): string {
  return value.toDate().toISOString().slice(0, 19)
}

/**
 * 后端返回的无后缀 datetime 按 UTC 解析，再由 Dayjs 转成浏览器本地时间回显。
 */
export function fromUtcNaiveDateTime(value: string): Dayjs {
  const normalized = TIMEZONE_SUFFIX.test(value) ? value : `${value}Z`
  return dayjs(new Date(normalized))
}
