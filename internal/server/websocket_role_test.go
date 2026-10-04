package server

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"

	"github.com/nospy/albion-openradar/internal/photon"
)

// The browser logger opens its own socket to /ws purely to push logs upstream.
// It must not count as a radar client for broadcasts, otherwise every event is
// serialized and sent twice per open page.
func TestLoggerRoleClientSkipsBroadcasts(t *testing.T) {
	ws := NewWebSocketHandler(nil)
	srv := httptest.NewServer(ws)
	defer srv.Close()
	defer ws.CloseAllClients()

	url := "ws" + strings.TrimPrefix(srv.URL, "http")

	radar, _, err := websocket.DefaultDialer.Dial(url, nil)
	require.NoError(t, err)
	defer radar.Close()

	loggerConn, _, err := websocket.DefaultDialer.Dial(url+"?role=logger", nil)
	require.NoError(t, err)
	defer loggerConn.Close()

	require.Eventually(t, func() bool { return ws.ClientCount() == 2 }, time.Second, 10*time.Millisecond)
	require.Equal(t, 1, ws.subscriberCount())

	ws.BroadcastEvent(&photon.EventData{Code: 3, Parameters: map[byte]interface{}{252: byte(3)}})
	ws.flushBatch()

	require.NoError(t, radar.SetReadDeadline(time.Now().Add(time.Second)))
	_, msg, err := radar.ReadMessage()
	require.NoError(t, err)
	require.Contains(t, string(msg), "\"type\":\"batch\"")

	require.NoError(t, loggerConn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err = loggerConn.ReadMessage()
	require.Error(t, err, "logger socket must not receive event broadcasts")
}

// With nobody subscribed there is nothing to serialize: the batch is dropped
// before the JSON marshal instead of being encoded for zero recipients.
func TestFlushBatchSkipsMarshalWithoutSubscribers(t *testing.T) {
	ws := NewWebSocketHandler(nil)
	defer ws.CloseAllClients()

	ws.BroadcastEvent(&photon.EventData{Code: 3, Parameters: map[byte]interface{}{252: byte(3)}})
	ws.flushBatch()

	stats := ws.Stats()
	require.Equal(t, uint64(0), stats.BatchesSent)
	require.Equal(t, 0, stats.MessagesQueue)
}
