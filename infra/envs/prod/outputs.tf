output "site_bucket_name" {
  value = module.static_site.bucket_name
}

output "distribution_id" {
  description = "Điền vào site_distribution_id của infra/bootstrap (tạo role site-deploy)."
  value       = module.static_site.distribution_id
}

output "distribution_domain_name" {
  description = "Địa chỉ *.cloudfront.net (SITE_URL tạm trước khi có tên miền — §11.3 mục 7)."
  value       = module.static_site.distribution_domain_name
}

output "name_servers" {
  description = "Nameserver Route 53 đặt ở registrar (rỗng khi chưa có domain_name)."
  value       = module.dns.name_servers
}
