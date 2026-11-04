variable "domain_name" {
  description = "Tên miền apex (Duy mua). Rỗng → module không tạo gì; site chạy trên *.cloudfront.net."
  type        = string
  default     = ""

  validation {
    condition     = var.domain_name == "" || can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.domain_name))
    error_message = "domain_name phải là tên miền apex viết thường (không có www., không có dấu chấm cuối) hoặc rỗng."
  }
}

variable "create_alias_records" {
  description = "Tạo ALIAS A/AAAA apex + www trỏ về CloudFront."
  type        = bool
  default     = true
}

variable "distribution_domain_name" {
  description = "domain_name của distribution CloudFront (output static-site)."
  type        = string
  default     = ""
}

variable "distribution_hosted_zone_id" {
  description = "hosted_zone_id của distribution CloudFront (output static-site)."
  type        = string
  default     = ""
}

variable "caa_issuers" {
  description = "CA được phép cấp chứng chỉ (tài liệu ACM \"CAA records\"; kiểm lại lúc apply)."
  type        = list(string)
  default     = ["amazon.com", "amazontrust.com", "awstrust.com", "amazonaws.com"]
}

variable "record_ttl" {
  description = "TTL cho CAA (giây). Tăng lên 3600 khi ổn định."
  type        = number
  default     = 300
}
