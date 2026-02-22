package amc

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// Middleware returns an http.Handler that automatically captures request/response
// evidence and forwards it to the AMC Bridge telemetry endpoint.
//
// Usage:
//
//	mux := http.NewServeMux()
//	handler := amc.Middleware(amc.MiddlewareConfig{
//	    BridgeURL: "http://localhost:3212",
//	    Token:     "your-token",
//	})(mux)
//	http.ListenAndServe(":8080", handler)
type MiddlewareConfig struct {
	BridgeURL    string
	Token        string
	SessionID    string
	ExcludePaths map[string]bool
}

// Middleware creates an HTTP middleware that reports telemetry to AMC Bridge.
func Middleware(cfg MiddlewareConfig) func(http.Handler) http.Handler {
	client := NewClient(Config{
		BridgeURL: cfg.BridgeURL,
		Token:     cfg.Token,
	})

	if cfg.SessionID == "" {
		cfg.SessionID = uuid.New().String()
	}

	if cfg.ExcludePaths == nil {
		cfg.ExcludePaths = map[string]bool{
			"/health":  true,
			"/healthz": true,
			"/readyz":  true,
			"/metrics": true,
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cfg.ExcludePaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			correlationID := uuid.New().String()
			start := time.Now()

			// Wrap response writer to capture status code
			rw := &responseWriter{ResponseWriter: w, statusCode: 200}
			w.Header().Set("X-Amc-Correlation-Id", correlationID)

			next.ServeHTTP(rw, r)

			durationMs := time.Since(start).Milliseconds()

			// Fire-and-forget telemetry
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				_, _ = client.ReportTelemetry(ctx, TelemetryEvent{
					SessionID: cfg.SessionID,
					EventType: "http_request",
					Payload: map[string]any{
						"method":        r.Method,
						"path":          r.URL.Path,
						"status":        rw.statusCode,
						"durationMs":    durationMs,
						"correlationId": correlationID,
					},
					CorrelationID: correlationID,
				})
			}()
		})
	}
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.written {
		rw.statusCode = code
		rw.written = true
	}
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.written = true
	}
	return rw.ResponseWriter.Write(b)
}

// EvidenceMiddleware wraps a handler to capture evidence and submit it.
// It records method, path, status, duration and submits as evidence.
func EvidenceMiddleware(client *Client, sessionID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			correlationID := uuid.New().String()
			start := time.Now()

			rw := &responseWriter{ResponseWriter: w, statusCode: 200}
			w.Header().Set("X-Amc-Correlation-Id", correlationID)

			next.ServeHTTP(rw, r)

			durationMs := time.Since(start).Milliseconds()

			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				evidence := map[string]any{
					"method":     r.Method,
					"path":       r.URL.Path,
					"status":     rw.statusCode,
					"durationMs": durationMs,
					"hash":       OutputHash(fmt.Sprintf("%s %s %d %d", r.Method, r.URL.Path, rw.statusCode, durationMs)),
				}
				_, _ = client.ReportTelemetry(ctx, TelemetryEvent{
					SessionID:     sessionID,
					EventType:     "evidence_capture",
					Payload:       evidence,
					CorrelationID: correlationID,
				})
			}()
		})
	}
}
