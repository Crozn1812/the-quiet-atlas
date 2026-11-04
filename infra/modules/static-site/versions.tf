terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
      # aws          : region chính (ap-southeast-1) — bucket S3.
      # aws.us_east_1: WAF scope CLOUDFRONT bắt buộc ở us-east-1.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
