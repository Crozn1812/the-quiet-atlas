terraform {
  # use_lockfile của backend S3 cần Terraform >= 1.10 (spec §11.5).
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }

  # Partial config: bucket/key/region nằm trong backend.hcl (KHÔNG commit; mẫu: backend.hcl.example).
  #   terraform init -backend-config=backend.hcl
  # Khóa state bằng file .tflock trong S3, không cần DynamoDB.
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}
