package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
	"time"
)

// Scripts and styles must never be served from the browser cache after an update:
// the ETag is the build version and the response asks for revalidation every time.
func TestGzipFSHandler_VersionedETagRevalidates(t *testing.T) {
	fsys := fstest.MapFS{"app.js": {Data: []byte("console.log(1)")}}
	s := &HTTPServer{version: "1.6"}
	h := s.gzipFSHandlerDirect("/scripts/", fsys, time.Hour)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/scripts/app.js", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("ETag"); got != `"1.6"` {
		t.Errorf("ETag = %q, want %q", got, `"1.6"`)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control = %q, want no-cache", got)
	}

	req := httptest.NewRequest(http.MethodGet, "/scripts/app.js", nil)
	req.Header.Set("If-None-Match", `"1.6"`)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotModified {
		t.Errorf("same version: status = %d, want 304", rec.Code)
	}

	req.Header.Set("If-None-Match", `"1.5"`)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.Len() == 0 {
		t.Errorf("old version: status = %d body=%d, want 200 with body", rec.Code, rec.Body.Len())
	}
}
