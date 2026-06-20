output "release_name" {
  description = "Helm release name."
  value       = helm_release.amc.name
}

output "namespace" {
  description = "Kubernetes namespace."
  value       = helm_release.amc.namespace
}

output "status" {
  description = "Helm release status."
  value       = helm_release.amc.status
}
