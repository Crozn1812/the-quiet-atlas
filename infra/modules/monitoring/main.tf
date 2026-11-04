# monitoring (spec §11.4, Q25): SNS email, AWS Budgets 10 USD/tháng tính chi phí TRƯỚC credits,
# Cost Anomaly Detection. Root truyền provider us-east-1 (Billing/Budgets/CE là dịch vụ toàn cầu).
# Free Tier usage alerts: bật tay trong Billing preferences (không có resource Terraform) — runbook aws-budgets.md.

data "aws_caller_identity" "current" {}

locals {
  n = var.enabled ? 1 : 0
  # Chỉ lộ "có/không có email", không lộ địa chỉ.
  email_count = var.enabled && nonsensitive(var.alert_email != "") ? 1 : 0
}

resource "aws_sns_topic" "cost_alerts" {
  count = local.n

  name = "${var.name_prefix}-cost-alerts"
  # SSE bằng KMS key riêng bị tránh (§11.4).
}

data "aws_iam_policy_document" "cost_alerts" {
  count = local.n

  statement {
    sid     = "AllowBudgetsAndCostAnomalyPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com", "costalerts.amazonaws.com"]
    }

    resources = [aws_sns_topic.cost_alerts[0].arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "cost_alerts" {
  count = local.n

  arn    = aws_sns_topic.cost_alerts[0].arn
  policy = data.aws_iam_policy_document.cost_alerts[0].json
}

# Email cần bấm "Confirm subscription" trong hộp thư; Terraform không xác nhận thay.
resource "aws_sns_topic_subscription" "email" {
  count = local.email_count

  topic_arn = aws_sns_topic.cost_alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_budgets_budget" "monthly" {
  count = local.n

  name         = "${var.name_prefix}-monthly-cost"
  budget_type  = "COST"
  limit_amount = format("%.2f", var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Chi phí trước credits (§11.4): không trừ credits/refund để thấy mức tiêu thật.
  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = var.budget_notifications

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold_percent
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_sns_topic_arns  = [aws_sns_topic.cost_alerts[0].arn]
      subscriber_email_addresses = var.alert_email != "" ? [var.alert_email] : []
    }
  }

  depends_on = [aws_sns_topic_policy.cost_alerts]
}

resource "aws_ce_anomaly_monitor" "services" {
  count = local.n

  name              = "${var.name_prefix}-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "alerts" {
  count = local.n

  name             = "${var.name_prefix}-anomaly-alerts"
  frequency        = "IMMEDIATE" # SNS chỉ nhận IMMEDIATE
  monitor_arn_list = [aws_ce_anomaly_monitor.services[0].arn]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.cost_alerts[0].arn
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [format("%.2f", var.anomaly_threshold_usd)]
    }
  }

  depends_on = [aws_sns_topic_policy.cost_alerts]
}
