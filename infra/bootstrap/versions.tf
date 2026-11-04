# L5-012 — Bootstrap (spec §11.5): chạy TAY một lần, bởi Duy (hoặc Lead khi Duy cho phép từng lần).
# State của bootstrap để LOCAL (terraform.tfstate trong thư mục này, đã nằm trong .gitignore) vì bucket state
# chính là thứ bootstrap tạo ra. Không commit state; giữ bản sao an toàn ngoài repo.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "the-quiet-atlas"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}
