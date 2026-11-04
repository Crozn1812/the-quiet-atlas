output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.site.arn
}

output "distribution_id" {
  description = "Điền vào site_distribution_id của infra/bootstrap để tạo role site-deploy."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "distribution_hosted_zone_id" {
  description = "Hosted zone ID của CloudFront cho record ALIAS."
  value       = aws_cloudfront_distribution.site.hosted_zone_id
}

output "web_acl_arn" {
  value = aws_wafv2_web_acl.site.arn
}
