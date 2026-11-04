# Ba role cho GitHub Actions (spec §11.6). Bản NHÁP quyền tối thiểu: sau lần `plan` đầu tiên (do Duy cho phép)
# đối chiếu AccessDenied/CloudTrail để siết tiếp. Không role nào có quyền IAM.

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  state_objects_arn = "${aws_s3_bucket.state.arn}/${var.state_key_prefix}*"
  site_bucket_arn   = "arn:${local.partition}:s3:::${var.site_bucket_name}"

  create_site_deploy    = var.site_distribution_id != ""
  site_distribution_arn = "arn:${local.partition}:cloudfront::${local.account_id}:distribution/${var.site_distribution_id}"
}

# ---------------------------------------------------------------------------------------------------------------
# tf-plan — CHỈ ĐỌC, cho job pull_request. Quyền ghi duy nhất: file khóa *.tflock của state (use_lockfile).
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "tf_plan" {
  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "StateRead"
    actions   = ["s3:GetObject"]
    resources = [local.state_objects_arn]
  }

  statement {
    sid       = "StateLockFile"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/${var.state_key_prefix}*.tflock"]
  }

  statement {
    sid = "ReadManagedServices"
    actions = [
      "cloudfront:Get*",
      "cloudfront:List*",
      "cloudfront:Describe*",
      "wafv2:Get*",
      "wafv2:List*",
      "wafv2:Describe*",
      "route53:Get*",
      "route53:List*",
      "acm:Describe*",
      "acm:List*",
      "budgets:ViewBudget",
      "budgets:ListTagsForResource",
      "ce:GetAnomalyMonitors",
      "ce:GetAnomalySubscriptions",
      "ce:ListTagsForResource",
      "sns:GetTopicAttributes",
      "sns:GetSubscriptionAttributes",
      "sns:ListSubscriptionsByTopic",
      "sns:ListTagsForResource",
    ]
    resources = ["*"]
  }

  # Chỉ cấu hình bucket site (không đọc object).
  statement {
    sid = "ReadSiteBucketConfig"
    actions = [
      "s3:ListBucket",
      "s3:GetBucket*",
      "s3:GetAccelerateConfiguration",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
    ]
    resources = [local.site_bucket_arn]
  }
}

resource "aws_iam_role" "tf_plan" {
  name                 = "${var.name_prefix}-tf-plan"
  description          = "GitHub Actions (pull_request): terraform plan, chi doc."
  assume_role_policy   = data.aws_iam_policy_document.trust_pull_request.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "tf_plan" {
  name   = "${var.name_prefix}-tf-plan"
  role   = aws_iam_role.tf_plan.id
  policy = data.aws_iam_policy_document.tf_plan.json
}

# ---------------------------------------------------------------------------------------------------------------
# tf-apply — environment:production (duyệt tay). Quản lý đúng các dịch vụ của envs/prod; KHÔNG có IAM.
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "tf_apply" {
  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "StateReadWrite"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [local.state_objects_arn]
  }

  statement {
    sid       = "SiteBucket"
    actions   = ["s3:*"]
    resources = [local.site_bucket_arn, "${local.site_bucket_arn}/*"]
  }

  # CloudFront/WAF/Route 53/ACM: nhiều action (List*, Create*) không hỗ trợ giới hạn theo ARN.
  # Tài khoản chỉ phục vụ dự án này (§11.1); siết theo ARN sau lần plan đầu nếu cần.
  statement {
    sid = "EdgeAndDns"
    actions = [
      "cloudfront:*",
      "wafv2:*",
      "route53:*",
      "acm:*",
    ]
    resources = ["*"]
  }

  statement {
    sid = "CostGuardrails"
    actions = [
      "budgets:ViewBudget",
      "budgets:ModifyBudget",
      "budgets:ListTagsForResource",
      "budgets:TagResource",
      "budgets:UntagResource",
    ]
    resources = ["arn:${local.partition}:budgets::${local.account_id}:budget/${var.name_prefix}-*"]
  }

  statement {
    sid = "CostAnomaly"
    actions = [
      "ce:CreateAnomalyMonitor",
      "ce:UpdateAnomalyMonitor",
      "ce:DeleteAnomalyMonitor",
      "ce:GetAnomalyMonitors",
      "ce:CreateAnomalySubscription",
      "ce:UpdateAnomalySubscription",
      "ce:DeleteAnomalySubscription",
      "ce:GetAnomalySubscriptions",
      "ce:TagResource",
      "ce:UntagResource",
      "ce:ListTagsForResource",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "AlertTopic"
    actions   = ["sns:*"]
    resources = ["arn:${local.partition}:sns:*:${local.account_id}:${var.name_prefix}-*"]
  }
}

resource "aws_iam_role" "tf_apply" {
  name                 = "${var.name_prefix}-tf-apply"
  description          = "GitHub Actions (environment production): terraform apply envs/prod."
  assume_role_policy   = data.aws_iam_policy_document.trust_production.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "tf_apply" {
  name   = "${var.name_prefix}-tf-apply"
  role   = aws_iam_role.tf_apply.id
  policy = data.aws_iam_policy_document.tf_apply.json
}

# ---------------------------------------------------------------------------------------------------------------
# site-deploy — environment:production. Chỉ ghi/xóa object của đúng bucket site + invalidation đúng distribution.
# Chỉ tạo khi đã biết site_distribution_id (sau lần apply envs/prod đầu tiên).
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "site_deploy" {
  count = local.create_site_deploy ? 1 : 0

  statement {
    sid       = "ListSiteBucket"
    actions   = ["s3:ListBucket"]
    resources = [local.site_bucket_arn]
  }

  statement {
    sid       = "WriteSiteObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.site_bucket_arn}/*"]
  }

  statement {
    sid       = "InvalidateSiteDistribution"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [local.site_distribution_arn]
  }
}

resource "aws_iam_role" "site_deploy" {
  count = local.create_site_deploy ? 1 : 0

  name                 = "${var.name_prefix}-site-deploy"
  description          = "GitHub Actions (environment production): upload site + invalidate HTML."
  assume_role_policy   = data.aws_iam_policy_document.trust_production.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "site_deploy" {
  count = local.create_site_deploy ? 1 : 0

  name   = "${var.name_prefix}-site-deploy"
  role   = aws_iam_role.site_deploy[0].id
  policy = data.aws_iam_policy_document.site_deploy[0].json
}
