output "state_bucket_name" {
  description = "Điền vào `bucket` của infra/envs/prod/backend.hcl (file không commit)."
  value       = aws_s3_bucket.state.bucket
}

output "github_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}

output "tf_plan_role_arn" {
  value = aws_iam_role.tf_plan.arn
}

output "tf_apply_role_arn" {
  value = aws_iam_role.tf_apply.arn
}

output "site_deploy_role_arn" {
  description = "Rỗng cho tới khi site_distribution_id được đặt."
  value       = try(aws_iam_role.site_deploy[0].arn, "")
}
