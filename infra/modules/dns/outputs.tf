output "enabled" {
  value = local.enabled
}

output "zone_id" {
  value = try(aws_route53_zone.this[0].zone_id, "")
}

output "name_servers" {
  description = "4 nameserver đặt ở registrar (runbook domain-and-acm.md Bước 4)."
  value       = try(aws_route53_zone.this[0].name_servers, [])
}

output "aliases" {
  description = "Tên miền gắn vào distribution (apex, www) hoặc rỗng."
  value       = local.enabled ? [var.domain_name, local.www_name] : []
}

output "certificate_arn" {
  description = "ARN chứng chỉ ĐÃ validate (chờ aws_acm_certificate_validation) hoặc rỗng."
  value       = try(aws_acm_certificate_validation.this[0].certificate_arn, "")
}
