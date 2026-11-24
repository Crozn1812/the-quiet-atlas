# REL-01: manual site deployment from this repository's main branch only.
# Do not attach a GitHub Environment to this job: that changes the token's sub.
data "aws_iam_policy_document" "trust_site_deploy" {
  statement {
    sid     = "GitHubOidcMainSiteDeploy"
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
      values   = local.sub_main
    }
  }
}
