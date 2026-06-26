provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}

locals {
  inline_values = {
    replicaCount = var.replica_count
    image = {
      repository = var.image_repository
      tag        = var.image_tag
      pullPolicy = var.image_pull_policy
    }
    ingress = {
      enabled   = var.ingress_enabled
      className = var.ingress_class_name
      hosts = [
        {
          host = var.ingress_host
          paths = [
            {
              path     = "/"
              pathType = "Prefix"
            }
          ]
        }
      ]
      tls = var.ingress_tls_secret_name == "" ? [] : [
        {
          secretName = var.ingress_tls_secret_name
          hosts      = [var.ingress_host]
        }
      ]
    }
    workspace = {
      persistence = {
        enabled          = true
        storageClassName = var.storage_class_name
        size             = var.workspace_storage_size
      }
    }
  }
}

resource "helm_release" "amc" {
  name             = var.release_name
  namespace        = var.namespace
  chart            = var.chart_path
  create_namespace = true
  atomic           = true
  cleanup_on_fail  = true
  lint             = true
  wait             = true
  timeout          = var.timeout_seconds

  values = concat(
    [yamlencode(local.inline_values)],
    [for path in var.values_files : file(path)]
  )
}
