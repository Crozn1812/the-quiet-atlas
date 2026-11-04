locals {
  default_tags = {
    Project   = "the-quiet-atlas"
    ManagedBy = "terraform"
    Stack     = "prod"
  }
}

# Region chính: S3 (và Lambda/DynamoDB ở C1) — §11.5.
provider "aws" {
  region = var.region

  default_tags {
    tags = local.default_tags
  }
}

# us-east-1: ACM cho CloudFront, WAF scope CLOUDFRONT, Budgets/Cost Anomaly/SNS cảnh báo chi phí.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.default_tags
  }
}
