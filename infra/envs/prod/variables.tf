variable "region" {
  description = "Region chính (spec §11.5)."
  type        = string
  default     = "ap-southeast-1"
}

variable "name_prefix" {
  type    = string
  default = "tqa"
}

variable "site_bucket_name" {
  description = "Tên bucket S3 của site (duy nhất toàn cầu; trùng site_bucket_name của infra/bootstrap)."
  type        = string
}

variable "domain_name" {
  description = "Tên miền apex. Rỗng (mặc định) → chưa tạo DNS/ACM, site chạy trên *.cloudfront.net."
  type        = string
  default     = ""
}

variable "waf_rate_limit" {
  description = "Request tối đa mỗi IP trong 5 phút trước khi WAF chặn."
  type        = number
  default     = 1000
}

variable "cost_guardrails_managed_by_terraform" {
  description = "true → module monitoring tạo Budgets/SNS/Cost Anomaly. Mặc định false vì Duy tạo tay TRƯỚC resource đầu tiên (§11.4, runbook aws-budgets.md)."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email nhận cảnh báo chi phí (chỉ dùng khi cost_guardrails_managed_by_terraform = true)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "monthly_budget_usd" {
  description = "Budget hằng tháng (USD) — Q-07."
  type        = number
  default     = 10
}
