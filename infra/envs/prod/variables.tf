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

variable "dns_certificate_enabled" {
  description = "False khi tạo hosted zone lần đầu; true sau khi NS đã trỏ về Route 53 (runbook terraform.md)."
  type        = bool
  default     = true
}

variable "operational_alert_topic_arn" {
  description = "SNS us-east-1 có sẵn cho alarm CloudFront; rỗng = tạo topic riêng đăng ký alert_email."
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
  description = "Email cho SNS vận hành và cảnh báo chi phí nếu Terraform quản lý Budgets. Bắt buộc khi không dùng operational_alert_topic_arn."
  type        = string
  default     = ""
  sensitive   = true
}

variable "monthly_budget_usd" {
  description = "Budget hằng tháng (USD) — Q-07."
  type        = number
  default     = 10
}
