// Package amc provides a Go client for the Agent Maturity Compass Bridge HTTP API.
//
// It supports all provider endpoints (OpenAI, Anthropic, Gemini, OpenRouter, xAI, local),
// telemetry reporting, evidence hashing, lease management, and secret redaction.
//
// Usage:
//
//	client := amc.NewClient(amc.Config{BridgeURL: "http://localhost:3212", Token: "your-token"})
//	resp, err := client.OpenAIChat(ctx, map[string]any{"model": "gpt-4", "messages": []any{...}})
package amc

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Config holds configuration for the AMC client.
type Config struct {
	BridgeURL   string
	Token       string
	WorkspaceID string
	Timeout     time.Duration
}

// BridgeResponse wraps an HTTP response from the Bridge API.
type BridgeResponse struct {
	Status        int
	Body          json.RawMessage
	RequestID     string
	Receipt       string
	CorrelationID string
}

// OK returns true if the response status is 2xx.
func (r *BridgeResponse) OK() bool {
	return r.Status >= 200 && r.Status < 300
}

// Decode unmarshals the body into the given target.
func (r *BridgeResponse) Decode(target any) error {
	return json.Unmarshal(r.Body, target)
}

// Client is the AMC Bridge HTTP client.
type Client struct {
	cfg  Config
	http *http.Client
}

// NewClient creates a new AMC client. It reads AMC_BRIDGE_URL, AMC_TOKEN,
// and AMC_WORKSPACE_ID from the environment as defaults.
func NewClient(cfg Config) *Client {
	if cfg.BridgeURL == "" {
		cfg.BridgeURL = os.Getenv("AMC_BRIDGE_URL")
	}
	if cfg.BridgeURL == "" {
		cfg.BridgeURL = "http://localhost:3212"
	}
	cfg.BridgeURL = strings.TrimRight(cfg.BridgeURL, "/")

	if cfg.Token == "" {
		cfg.Token = os.Getenv("AMC_TOKEN")
	}
	if cfg.WorkspaceID == "" {
		cfg.WorkspaceID = os.Getenv("AMC_WORKSPACE_ID")
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}

	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: cfg.Timeout},
	}
}

// NewClientFromEnv creates a client entirely from AMC_* env vars.
func NewClientFromEnv() *Client {
	return NewClient(Config{})
}

func (c *Client) callBridge(ctx context.Context, path string, payload any, correlationID string) (*BridgeResponse, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("amc: marshal payload: %w", err)
	}

	url := c.cfg.BridgeURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("amc: create request: %w", err)
	}

	if correlationID == "" {
		correlationID = uuid.New().String()
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.Token)
	req.Header.Set("X-Amc-Correlation-Id", correlationID)
	if c.cfg.WorkspaceID != "" {
		req.Header.Set("X-Amc-Workspace-Id", c.cfg.WorkspaceID)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("amc: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("amc: read response: %w", err)
	}

	return &BridgeResponse{
		Status:        resp.StatusCode,
		Body:          json.RawMessage(body),
		RequestID:     resp.Header.Get("X-Amc-Bridge-Request-Id"),
		Receipt:       resp.Header.Get("X-Amc-Receipt"),
		CorrelationID: resp.Header.Get("X-Amc-Correlation-Id"),
	}, nil
}

// --- Provider methods ---

// OpenAIChat sends a chat completion request via the OpenAI provider.
func (c *Client) OpenAIChat(ctx context.Context, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, "/bridge/openai/v1/chat/completions", payload, "")
}

// OpenAIResponses sends a request to the OpenAI responses endpoint.
func (c *Client) OpenAIResponses(ctx context.Context, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, "/bridge/openai/v1/responses", payload, "")
}

// AnthropicMessages sends a messages request via the Anthropic provider.
func (c *Client) AnthropicMessages(ctx context.Context, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, "/bridge/anthropic/v1/messages", payload, "")
}

// GeminiGenerateContent sends a generateContent request via the Gemini provider.
func (c *Client) GeminiGenerateContent(ctx context.Context, model string, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, fmt.Sprintf("/bridge/gemini/v1beta/models/%s:generateContent", url.PathEscape(model)), payload, "")
}

// OpenRouterChat sends a chat completion request via OpenRouter.
func (c *Client) OpenRouterChat(ctx context.Context, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, "/bridge/openrouter/v1/chat/completions", payload, "")
}

// XAIChat sends a chat completion request via xAI/Grok.
func (c *Client) XAIChat(ctx context.Context, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, "/bridge/xai/v1/chat/completions", payload, "")
}

// LocalChat sends a chat completion request via local (OpenAI-compatible) provider.
func (c *Client) LocalChat(ctx context.Context, payload map[string]any) (*BridgeResponse, error) {
	if err := assertNoSelfScoring(payload); err != nil {
		return nil, err
	}
	return c.callBridge(ctx, "/bridge/local/v1/chat/completions", payload, "")
}

// --- Telemetry ---

// TelemetryEvent represents a telemetry event payload.
type TelemetryEvent struct {
	SessionID     string
	EventType     string
	Payload       any
	CorrelationID string
	RunID         string
	Provider      string
}

// ReportTelemetry sends a telemetry event to the Bridge.
func (c *Client) ReportTelemetry(ctx context.Context, evt TelemetryEvent) (*BridgeResponse, error) {
	body := map[string]any{
		"sessionId": evt.SessionID,
		"eventType": evt.EventType,
		"payload":   evt.Payload,
	}
	if evt.CorrelationID != "" {
		body["correlationId"] = evt.CorrelationID
	}
	if evt.RunID != "" {
		body["runId"] = evt.RunID
	}
	if evt.Provider != "" {
		body["provider"] = evt.Provider
	}
	return c.callBridge(ctx, "/bridge/telemetry", body, evt.CorrelationID)
}

// ReportOutput reports agent output as a telemetry event.
func (c *Client) ReportOutput(ctx context.Context, sessionID string, value any) (*BridgeResponse, error) {
	return c.ReportTelemetry(ctx, TelemetryEvent{
		SessionID: sessionID,
		EventType: "agent_stdout",
		Payload:   value,
	})
}

// --- Evidence utilities ---

// OutputHash computes SHA256 hash of output for evidence verification.
func OutputHash(value any) string {
	var data []byte
	switch v := value.(type) {
	case string:
		data = []byte(v)
	default:
		data, _ = json.Marshal(v)
	}
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
}

// --- Redaction ---

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`sk-[A-Za-z0-9]{10,}`),
	regexp.MustCompile(`(?i)(?:api|secret|token|key)\s*[:=]\s*[A-Za-z0-9._-]{10,}`),
	regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._-]{10,}`),
	regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`),
}

// Redact removes secret-like patterns from text.
func Redact(text string) string {
	result := text
	for _, pat := range secretPatterns {
		result = pat.ReplaceAllString(result, "[REDACTED]")
	}
	return result
}

// --- Self-scoring guard ---

func assertNoSelfScoring(payload map[string]any) error {
	messages, ok := payload["messages"]
	if !ok {
		return nil
	}
	msgSlice, ok := messages.([]any)
	if !ok {
		return nil
	}
	for _, msg := range msgSlice {
		m, ok := msg.(map[string]any)
		if !ok {
			continue
		}
		content, ok := m["content"].(string)
		if !ok {
			continue
		}
		if strings.Contains(strings.ToLower(content), "amc_self_score") {
			return errors.New("amc: self-scoring detected — AMC SDK cannot be used to score its own outputs")
		}
	}
	return nil
}

// --- Lease management ---

// LeaseInfo holds lease metadata.
type LeaseInfo struct {
	LeaseID   string   `json:"leaseId"`
	AgentID   string   `json:"agentId"`
	ExpiresAt string   `json:"expiresAt"`
	Scopes    []string `json:"scopes"`
}

// RequestLease requests a new lease from Studio lease routes.
func (c *Client) RequestLease(ctx context.Context, agentID string, scopes []string, durationSec int) (*BridgeResponse, error) {
	if durationSec <= 0 {
		durationSec = 3600
	}
	scopeList := strings.Join(scopes, ",")
	if scopeList == "" {
		scopeList = "gateway:llm,toolhub:intent,toolhub:execute"
	}
	body := map[string]any{
		"agentId": agentID,
		"ttl":     fmt.Sprintf("%ds", durationSec),
		"scopes":  scopeList,
	}
	return c.callBridge(ctx, "/leases/issue", body, "")
}

// RevokeLease revokes an active lease.
func (c *Client) RevokeLease(ctx context.Context, leaseID string) (*BridgeResponse, error) {
	body := map[string]any{"leaseId": leaseID}
	return c.callBridge(ctx, "/leases/revoke", body, "")
}

// --- Diagnostic ---

// QueryDiagnostic runs a diagnostic query for an agent.
func (c *Client) QueryDiagnostic(ctx context.Context, agentID string, questionIDs []string) (*BridgeResponse, error) {
	body := map[string]any{
		"agentId":     agentID,
		"questionIds": questionIDs,
	}
	return c.callBridge(ctx, "/bridge/diagnostic/query", body, "")
}
