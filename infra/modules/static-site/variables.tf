variable "name_prefix" {
  description = "Tiền tố tên tài nguyên (OAC, function, WAF)."
  type        = string
  default     = "tqa"
}

variable "bucket_name" {
  description = "Tên bucket S3 private chứa site (duy nhất toàn cầu)."
  type        = string
}

variable "aliases" {
  description = "Tên miền thay thế (apex, www). Rỗng → chạy trên *.cloudfront.net (spec §11.3 mục 7)."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN chứng chỉ ACM ở us-east-1 (đã validate). Rỗng → dùng chứng chỉ mặc định của CloudFront."
  type        = string
  default     = ""

  validation {
    condition     = var.acm_certificate_arn == "" || can(regex("^arn:aws[a-z-]*:acm:us-east-1:", var.acm_certificate_arn))
    error_message = "Chứng chỉ cho CloudFront phải ở us-east-1."
  }
}

variable "price_class" {
  description = "Price class CloudFront. Flat-rate plan không tính theo vùng; PriceClass_All để có edge ở Việt Nam."
  type        = string
  default     = "PriceClass_All"
}

variable "not_found_page_path" {
  description = "Trang 404 trong bucket (Next static export sinh /404.html)."
  type        = string
  default     = "/404.html"
}

variable "noncurrent_version_days" {
  description = "Số ngày giữ phiên bản object cũ (S3 versioning là lớp dự phòng rollback, §11.6)."
  type        = number
  default     = 30
}

variable "noncurrent_versions_to_keep" {
  description = "Số phiên bản cũ mới nhất luôn giữ lại cho mỗi object."
  type        = number
  default     = 3
}

variable "waf_rate_limit" {
  description = "Số request tối đa mỗi IP trong cửa sổ đánh giá của WAF trước khi chặn (luật 1, §11.2)."
  type        = number
  default     = 1000

  validation {
    condition     = var.waf_rate_limit >= 10
    error_message = "WAF rate limit tối thiểu là 10."
  }
}

variable "waf_evaluation_window_sec" {
  description = "Cửa sổ đánh giá rate-based (giây): 60, 120, 300 hoặc 600."
  type        = number
  default     = 300

  validation {
    condition     = contains([60, 120, 300, 600], var.waf_evaluation_window_sec)
    error_message = "Chỉ nhận 60, 120, 300 hoặc 600."
  }
}
