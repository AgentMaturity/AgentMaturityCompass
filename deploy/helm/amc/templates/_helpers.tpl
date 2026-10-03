{{- define "amc.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "amc.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "amc.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "amc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "amc.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "amc.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
A bootstrap Secret value: required, and never a published placeholder.
Usage: include "amc.bootstrapValue" (list "<values key>" <value>)
*/}}
{{- define "amc.bootstrapValue" -}}
{{- $name := index . 0 -}}
{{- $value := toString (required (printf "bootstrap.values.%s is required when bootstrap.createSecret=true" $name) (index . 1)) -}}
{{- if hasPrefix "change-me" (lower $value) -}}
{{- fail (printf "bootstrap.values.%s starts with the published placeholder prefix; supply a real value" $name) -}}
{{- end -}}
{{- $value | quote -}}
{{- end -}}
