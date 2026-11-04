variable "region" {
  description = "Region cho bucket state và các tài nguyên khu vực (spec §11.5: ap-southeast-1)."
  type        = string
  default     = "ap-southeast-1"
}

variable "github_repository" {
  description = "Repo GitHub được phép assume role qua OIDC, dạng <owner>/<repo>."
  type        = string
  default     = "Crozn1812/the-quiet-atlas"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository phải có dạng <owner>/<repo>, không chứa ký tự đại diện."
  }
}

variable "github_environment" {
  description = "GitHub Environment (duyệt tay) cho tf-apply và site-deploy (spec §11.6)."
  type        = string
  default     = "production"
}

variable "state_bucket_name" {
  description = "Tên bucket S3 chứa Terraform state của envs/prod (duy nhất toàn cầu). Giá trị thật chỉ trong terraform.tfvars (không commit)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_name phải là tên bucket S3 hợp lệ (3–63 ký tự thường, số, '.', '-')."
  }
}

variable "state_key_prefix" {
  description = "Tiền tố key state trong bucket (khớp `key` trong backend.hcl của envs/prod)."
  type        = string
  default     = "prod/"
}

variable "site_bucket_name" {
  description = "Tên bucket S3 của site (khớp site_bucket_name của envs/prod). Dùng để giới hạn quyền tf-apply/site-deploy."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.site_bucket_name))
    error_message = "site_bucket_name phải là tên bucket S3 hợp lệ."
  }
}

variable "site_distribution_id" {
  description = "ID distribution CloudFront của site (output distribution_id của envs/prod). Rỗng → chưa tạo role site-deploy (chạy lại bootstrap sau lần apply prod đầu tiên)."
  type        = string
  default     = ""
}

variable "name_prefix" {
  description = "Tiền tố tên IAM role/policy và SNS topic."
  type        = string
  default     = "tqa"
}

variable "noncurrent_state_retention_days" {
  description = "Số ngày giữ phiên bản state cũ trước khi S3 xóa."
  type        = number
  default     = 90
}
