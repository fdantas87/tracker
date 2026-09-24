export type HealthLevel = "ok" | "warn" | "error"

export interface HealthIssue {
  title: string
  message: string
  level: "warn" | "error"
}

export interface HealthStatus {
  level: HealthLevel
  issues: HealthIssue[]
}
