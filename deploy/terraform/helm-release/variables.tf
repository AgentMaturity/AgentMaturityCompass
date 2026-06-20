variable "kubeconfig_path" {
  type        = string
  description = "Path to kubeconfig used by the Helm provider."
  default     = "~/.kube/config"
}

variable "kube_context" {
  type        = string
  description = "Optional kubeconfig context. Leave empty for the current context."
  default     = null
}

variable "release_name" {
  type        = string
  description = "Helm release name."
  default     = "amc"
}

variable "namespace" {
  type        = string
  description = "Kubernetes namespace for AMC."
  default     = "amc-system"
}

variable "chart_path" {
  type        = string
  description = "Path to the local AMC Helm chart."
  default     = "../../helm/amc"
}

variable "values_files" {
  type        = list(string)
  description = "Additional Helm values files, applied after inline Terraform values."
  default     = []
}

variable "image_repository" {
  type        = string
  description = "AMC container image repository."
  default     = "ghcr.io/your-org/amc-studio"
}

variable "image_tag" {
  type        = string
  description = "AMC container image tag."
  default     = "latest"
}

variable "image_pull_policy" {
  type        = string
  description = "Kubernetes image pull policy."
  default     = "IfNotPresent"
}

variable "replica_count" {
  type        = number
  description = "Number of AMC Studio replicas."
  default     = 2
}

variable "workspace_storage_size" {
  type        = string
  description = "Persistent volume size for the AMC workspace."
  default     = "10Gi"
}

variable "storage_class_name" {
  type        = string
  description = "Optional Kubernetes StorageClass name."
  default     = ""
}

variable "ingress_enabled" {
  type        = bool
  description = "Enable Kubernetes Ingress."
  default     = false
}

variable "ingress_class_name" {
  type        = string
  description = "IngressClass name when ingress is enabled."
  default     = ""
}

variable "ingress_host" {
  type        = string
  description = "Ingress host when ingress is enabled."
  default     = "amc.example.com"
}

variable "ingress_tls_secret_name" {
  type        = string
  description = "Existing TLS secret name. Empty disables chart TLS entries."
  default     = ""
}

variable "timeout_seconds" {
  type        = number
  description = "Helm operation timeout in seconds."
  default     = 600
}
