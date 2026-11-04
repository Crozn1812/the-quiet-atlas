output "sns_topic_arn" {
  value = try(aws_sns_topic.cost_alerts[0].arn, "")
}

output "budget_name" {
  value = try(aws_budgets_budget.monthly[0].name, "")
}
