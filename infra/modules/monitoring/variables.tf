variable "enabled" {
  description = "Tạo guardrail chi phí bằng Terraform. Mặc định false: theo §11.4 Budgets phải có TRƯỚC resource đầu tiên nên Duy tạo tay (runbook aws-budgets.md); chỉ bật khi đã quyết định để Terraform quản lý (tránh budget/topic trùng)."
  type        = bool
  default     = false
}

variable "name_prefix" {
  type    = string
  default = "tqa"
}

variable "alert_email" {
  description = "Email nhận cảnh báo (SNS + Budgets). Giá trị thật chỉ trong terraform.tfvars (không commit). Rỗng → không đăng ký email."
  type        = string
  default     = ""
  sensitive   = true
}

variable "monthly_budget_usd" {
  description = "Ngưỡng budget hằng tháng (USD) — Q-07: 10."
  type        = number
  default     = 10
}

variable "budget_notifications" {
  description = "Ngưỡng cảnh báo theo % budget. Q-07: actual 1/5/10 USD (10/50/100%) + forecast 10 USD (100%)."
  type = list(object({
    threshold_percent = number
    type              = string # ACTUAL | FORECASTED
  }))
  default = [
    { threshold_percent = 10, type = "ACTUAL" },
    { threshold_percent = 50, type = "ACTUAL" },
    { threshold_percent = 100, type = "ACTUAL" },
    { threshold_percent = 100, type = "FORECASTED" },
  ]

  validation {
    condition     = alltrue([for n in var.budget_notifications : contains(["ACTUAL", "FORECASTED"], n.type)])
    error_message = "type chỉ nhận ACTUAL hoặc FORECASTED."
  }
}

variable "anomaly_threshold_usd" {
  description = "Cost Anomaly Detection: báo khi tổng tác động bất thường ≥ số USD này."
  type        = number
  default     = 1
}
