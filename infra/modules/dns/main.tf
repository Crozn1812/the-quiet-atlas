# dns (spec §11.3): hosted zone, CAA chỉ Amazon, ACM us-east-1 (apex + www, DNS validation), ALIAS A/AAAA.
# domain_name rỗng → không tạo gì (tên miền đang mua — DUY_QUEUE Q-09).
# Gắn hosted zone vào CloudFront flat-rate Free plan: thủ công (docs/runbook/terraform.md).

locals {
  enabled      = var.domain_name != ""
  www_name     = "www.${var.domain_name}"
  alias_names  = local.enabled && var.create_alias_records ? toset([var.domain_name, local.www_name]) : toset([])
  alias_types  = toset(["A", "AAAA"])
  alias_matrix = { for pair in setproduct(local.alias_names, local.alias_types) : "${pair[0]}-${pair[1]}" => { name = pair[0], type = pair[1] } }
}

resource "aws_route53_zone" "this" {
  count = local.enabled ? 1 : 0

  name    = var.domain_name
  comment = "The Quiet Atlas"
}

# Tạo trước khi xin chứng chỉ (runbook domain-and-acm.md Bước 5).
resource "aws_route53_record" "caa" {
  count = local.enabled ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = var.record_ttl
  records = concat(
    [for ca in var.caa_issuers : "0 issue \"${ca}\""],
    ["0 issuewild \";\""],
  )
}

resource "aws_acm_certificate" "this" {
  count    = local.enabled ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = [local.www_name]
  validation_method         = "DNS"
  key_algorithm             = "RSA_2048"

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [aws_route53_record.caa]
}

resource "aws_route53_record" "validation" {
  for_each = {
    for dvo in flatten([for c in aws_acm_certificate.this : c.domain_validation_options]) :
    dvo.domain_name => dvo
  }

  zone_id         = aws_route53_zone.this[0].zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  ttl             = 300
  records         = [each.value.resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  count    = local.enabled ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

resource "aws_route53_record" "alias" {
  for_each = local.alias_matrix

  zone_id = aws_route53_zone.this[0].zone_id
  name    = each.value.name
  type    = each.value.type

  alias {
    name                   = var.distribution_domain_name
    zone_id                = var.distribution_hosted_zone_id
    evaluate_target_health = false
  }

  lifecycle {
    precondition {
      condition     = var.distribution_domain_name != "" && var.distribution_hosted_zone_id != ""
      error_message = "Cần distribution_domain_name và distribution_hosted_zone_id để tạo ALIAS."
    }
  }
}
