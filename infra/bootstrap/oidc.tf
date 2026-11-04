# GitHub Actions OIDC (spec §11.6): không access key dài hạn. Mỗi role tin đúng một `sub` khớp CHÍNH XÁC
# (StringEquals, không wildcard) và `aud = sts.amazonaws.com`.

locals {
  github_oidc_host = "token.actions.githubusercontent.com"

  # sub do GitHub phát hành:
  #   job PR                      → repo:<owner>/<repo>:pull_request
  #   job gắn environment         → repo:<owner>/<repo>:environment:<name>
  sub_pull_request = "repo:${var.github_repository}:pull_request"
  sub_production   = "repo:${var.github_repository}:environment:${var.github_environment}"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list bỏ trống: AWS tự xác minh chứng chỉ của token.actions.githubusercontent.com.
}

data "aws_iam_policy_document" "trust_pull_request" {
  statement {
    sid     = "GitHubOidcPullRequest"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values   = [local.sub_pull_request]
    }
  }
}

data "aws_iam_policy_document" "trust_production" {
  statement {
    sid     = "GitHubOidcProductionEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values   = [local.sub_production]
    }
  }
}
