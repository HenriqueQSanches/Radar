package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/nospy/albion-openradar/internal/marketflip"
)

func newTestFlipAPI(t *testing.T) (*FlipAPI, *marketflip.Store) {
	t.Helper()
	store, err := marketflip.NewStore(t.TempDir())
	require.NoError(t, err)
	return NewFlipAPI(store), store
}

func TestFlipAPI_HandleOrders(t *testing.T) {
	api, store := newTestFlipAPI(t)
	require.NoError(t, store.PutAll([]marketflip.Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100, CapturedAt: time.Now()},
		{ItemID: "T5_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 200, CapturedAt: time.Now()},
	}))

	mux := http.NewServeMux()
	api.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/flip/orders", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var orders []marketflip.Order
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &orders))
	require.Len(t, orders, 2)
}

func TestFlipAPI_HandleOrders_FilterByCity(t *testing.T) {
	api, store := newTestFlipAPI(t)
	require.NoError(t, store.PutAll([]marketflip.Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100, CapturedAt: time.Now()},
		{ItemID: "T5_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 200, CapturedAt: time.Now()},
	}))

	mux := http.NewServeMux()
	api.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/flip/orders?city=Martlock", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	var orders []marketflip.Order
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &orders))
	require.Len(t, orders, 1)
	require.Equal(t, "T5_BAG", orders[0].ItemID)
}

func TestFlipAPI_HandleClear(t *testing.T) {
	api, store := newTestFlipAPI(t)
	require.NoError(t, store.PutAll([]marketflip.Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now()},
	}))

	mux := http.NewServeMux()
	api.Register(mux)

	req := httptest.NewRequest(http.MethodDelete, "/api/flip/orders", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, store.All())
}

func TestFlipAPI_HandleOpportunities(t *testing.T) {
	api, store := newTestFlipAPI(t)
	require.NoError(t, store.PutAll([]marketflip.Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100, CapturedAt: time.Now()},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 200, CapturedAt: time.Now()},
	}))

	mux := http.NewServeMux()
	api.Register(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/flip/opportunities", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var opportunities []marketflip.Opportunity
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &opportunities))
	require.Len(t, opportunities, 1)
	require.Equal(t, int64(100), opportunities[0].Spread)
}

func TestFlipAPI_NilStore(t *testing.T) {
	api := NewFlipAPI(nil)
	mux := http.NewServeMux()
	api.Register(mux)

	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/flip/orders"},
		{http.MethodDelete, "/api/flip/orders"},
		{http.MethodGet, "/api/flip/opportunities"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, tc.path)
	}
}
