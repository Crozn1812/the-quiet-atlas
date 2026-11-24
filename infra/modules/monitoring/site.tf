# Basic CloudFront metrics are free; no paid additional metrics or access logs.
# Root passes aws.us_east_1: CloudFront metrics use Region=Global in us-east-1.
locals {
  create_site_topic = var.site_monitoring_enabled && var.site_alarm_notifications_enabled && var.alarm_topic_arn == ""
  site_topic_arn    = var.alarm_topic_arn != "" ? var.alarm_topic_arn : try(aws_sns_topic.site_alerts[0].arn, "")
  # ADR 0021: project SCP denies SNS in us-east-1; alarm can run without actions (state visible in console).
  site_alarm_actions = var.site_alarm_notifications_enabled ? [local.site_topic_arn] : []
}

resource "aws_sns_topic" "site_alerts" {
  count = local.create_site_topic ? 1 : 0
  name  = "${var.name_prefix}-site-alerts"
}

data "aws_iam_policy_document" "site_alerts" {
  count = local.create_site_topic ? 1 : 0

  statement {
    sid       = "AllowCloudWatchPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.site_alerts[0].arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current[0].account_id]
    }
  }
}

resource "aws_sns_topic_policy" "site_alerts" {
  count  = local.create_site_topic ? 1 : 0
  arn    = aws_sns_topic.site_alerts[0].arn
  policy = data.aws_iam_policy_document.site_alerts[0].json
}

resource "aws_sns_topic_subscription" "site_email" {
  count     = local.create_site_topic && nonsensitive(var.alert_email != "") ? 1 : 0
  topic_arn = aws_sns_topic.site_alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "site_5xx" {
  count = var.site_monitoring_enabled ? 1 : 0

  alarm_name          = "${var.name_prefix}-cloudfront-5xx"
  alarm_description   = "CloudFront 5xx >= 1% for two consecutive 5-minute periods; inspect origin/deployment."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.site_alarm_actions
  ok_actions          = local.site_alarm_actions

  dimensions = {
    DistributionId = var.distribution_id
    Region         = "Global"
  }

  lifecycle {
    precondition {
      condition     = var.distribution_id != ""
      error_message = "CloudFront monitoring requires distribution_id."
    }
    precondition {
      condition     = !local.create_site_topic || var.alert_email != ""
      error_message = "Set alert_email for the dedicated SNS topic, or supply alarm_topic_arn with a confirmed subscriber."
    }
  }

  depends_on = [aws_sns_topic_policy.site_alerts]
}
