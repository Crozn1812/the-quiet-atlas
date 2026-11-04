terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
      # aws.us_east_1: ACM cho CloudFront bắt buộc ở us-east-1 (§11.3, §11.5).
      configuration_aliases = [aws.us_east_1]
    }
  }
}
