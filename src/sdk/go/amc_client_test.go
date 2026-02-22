package amc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClientDefaults(t *testing.T) {
	c := NewClient(Config{})
	if c.cfg.BridgeURL != "http://localhost:3212" {
		t.Errorf("expected default bridge URL, got %s", c.cfg.BridgeURL)
	}
	if c.cfg.Timeout.Seconds() != 30 {
		t.Errorf("expected 30s timeout, got %v", c.cfg.Timeout)
	}
}

func TestNewClientFromEnv(t *testing.T) {
	t.Setenv("AMC_BRIDGE_URL", "http://env-bridge:4444/")
	t.Setenv("AMC_TOKEN", "env-token")
	c := NewClientFromEnv()
	if c.cfg.BridgeURL != "http://env-bridge:4444" {
		t.Errorf("expected env bridge URL, got %s", c.cfg.BridgeURL)
	}
	if c.cfg.Token != "env-token" {
		t.Errorf("expected env token, got %s", c.cfg.Token)
	}
}

func TestOutputHash(t *testing.T) {
	h := OutputHash("hello")
	if len(h) != 64 {
		t.Errorf("expected 64-char hash, got %d", len(h))
	}
	// SHA256 of "hello"
	expected := "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	if h != expected {
		t.Errorf("hash mismatch: got %s, want %s", h, expected)
	}
}

func TestRedact(t *testing.T) {
	tests := []struct {
		input    string
		contains string
	}{
		{"my key is sk-1234567890abcdef", "[REDACTED]"},
		{"Bearer eyJhbGciOiJIUzI1NiJ9", "[REDACTED]"},
		{"safe text without secrets", "safe text"},
	}
	for _, tt := range tests {
		result := Redact(tt.input)
		if tt.contains == "[REDACTED]" {
			if result == tt.input {
				t.Errorf("expected redaction for %q", tt.input)
			}
		}
	}
}

func TestAssertNoSelfScoring(t *testing.T) {
	payload := map[string]any{
		"messages": []any{
			map[string]any{"content": "evaluate amc_self_score output"},
		},
	}
	if err := assertNoSelfScoring(payload); err == nil {
		t.Error("expected error for self-scoring payload")
	}
}

func TestOpenAIChat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/bridge/openai/v1/chat/completions" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing auth header")
		}
		w.Header().Set("X-Amc-Bridge-Request-Id", "req-123")
		w.WriteHeader(200)
		json.NewEncoder(w).Encode(map[string]string{"result": "ok"})
	}))
	defer server.Close()

	c := NewClient(Config{BridgeURL: server.URL, Token: "test-token"})
	resp, err := c.OpenAIChat(context.Background(), map[string]any{
		"model":    "gpt-4",
		"messages": []any{map[string]any{"role": "user", "content": "hello"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.OK() {
		t.Errorf("expected 2xx, got %d", resp.Status)
	}
	if resp.RequestID != "req-123" {
		t.Errorf("expected request ID req-123, got %s", resp.RequestID)
	}
}

func TestLeaseRoutes(t *testing.T) {
	var seenIssue bool
	var seenRevoke bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/leases/issue":
			seenIssue = true
		case "/leases/revoke":
			seenRevoke = true
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer server.Close()

	c := NewClient(Config{BridgeURL: server.URL, Token: "test-token"})
	if _, err := c.RequestLease(context.Background(), "agent-1", []string{"gateway:llm"}, 600); err != nil {
		t.Fatalf("request lease failed: %v", err)
	}
	if _, err := c.RevokeLease(context.Background(), "lease-1"); err != nil {
		t.Fatalf("revoke lease failed: %v", err)
	}
	if !seenIssue {
		t.Error("expected /leases/issue to be called")
	}
	if !seenRevoke {
		t.Error("expected /leases/revoke to be called")
	}
}

func TestMiddleware(t *testing.T) {
	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer bridge.Close()

	handler := Middleware(MiddlewareConfig{
		BridgeURL: bridge.URL,
		Token:     "test",
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	}))

	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if rec.Header().Get("X-Amc-Correlation-Id") == "" {
		t.Error("missing correlation ID header")
	}
}

func TestBridgeResponseDecode(t *testing.T) {
	resp := &BridgeResponse{
		Status: 200,
		Body:   json.RawMessage(`{"foo":"bar"}`),
	}
	var target map[string]string
	if err := resp.Decode(&target); err != nil {
		t.Fatal(err)
	}
	if target["foo"] != "bar" {
		t.Errorf("expected bar, got %s", target["foo"])
	}
}
