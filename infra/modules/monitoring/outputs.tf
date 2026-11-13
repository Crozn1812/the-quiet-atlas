output "sns_topic_arn" {
  value = try(aws_sns_topic.cost_alerts[0].arn, "")
}

output "budget_name" {
  value = try(aws_budgets_budget.monthly[0].name, "")
}

output "site_alarm_name" {
  value = try(aws_cloudwatch_metric_alarm.site_5xx[0].alarm_name, "")
}

output "site_alert_topic_arn" {
  value = local.site_topic_arn
}
