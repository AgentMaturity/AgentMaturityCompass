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
	if c.cfg.BridgeURL != "http://localhost:4100" {
		t.Errorf("expected default bridge URL, got %s", c.cfg.BridgeURL)
	}
	if c.cfg.Timeout.Seconds() != 30 {
		t.Errorf("expected 30s timeout, got %v", c.cfg.Timeout)
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
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic for self-scoring payload")
		}
	}()
	payload := map[string]any{
		"messages": []any{
			map[string]any{"content": "evaluate amc_self_score output"},
		},
	}
	assertNoSelfScoring(payload)
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

func TestMiddleware(t *testing.T) {
	telemetryCalled := false
	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		telemetryCalled = true
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
