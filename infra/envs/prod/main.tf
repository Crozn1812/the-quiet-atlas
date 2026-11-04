# envs/prod — ghép module (spec §11.5). KHÔNG apply khi chưa có lệnh của Duy (CLAUDE.md §6, runbook terraform.md).
# Thứ tự A2: Budgets (tay) → Paid plan → bootstrap → envs/prod → Free plan (tay) → tên miền.

module "monitoring" {
  source = "../../modules/monitoring"

  providers = {
    aws = aws.us_east_1
  }

  enabled            = var.cost_guardrails_managed_by_terraform
  name_prefix        = var.name_prefix
  alert_email        = var.alert_email
  monthly_budget_usd = var.monthly_budget_usd
}

module "dns" {
  source = "../../modules/dns"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  domain_name                 = var.domain_name
  distribution_domain_name    = module.static_site.distribution_domain_name
  distribution_hosted_zone_id = module.static_site.distribution_hosted_zone_id
}

module "static_site" {
  source = "../../modules/static-site"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix         = var.name_prefix
  bucket_name         = var.site_bucket_name
  aliases             = module.dns.aliases
  acm_certificate_arn = module.dns.certificate_arn
  waf_rate_limit      = var.waf_rate_limit
}
