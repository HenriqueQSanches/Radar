package farm

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func newTestPriceClient(t *testing.T, handler http.HandlerFunc) *PriceClient {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &PriceClient{httpClient: server.Client(), baseURL: server.URL}
}

func TestPriceClient_CheapestPrices_PicksLowestAcrossCities(t *testing.T) {
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]priceRow{
			{ItemID: "T1_CARROT", SellPriceMin: 50},
			{ItemID: "T1_CARROT", SellPriceMin: 30},
			{ItemID: "T1_CARROT", SellPriceMin: 40},
		})
	})

	prices, err := client.CheapestPrices([]string{"T1_CARROT"})
	require.NoError(t, err)
	require.Equal(t, int64(30), prices["T1_CARROT"])
}

func TestPriceClient_CheapestPrices_IgnoresZeroOrMissingListings(t *testing.T) {
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]priceRow{
			{ItemID: "T1_FARM_CARROT_SEED", SellPriceMin: 0},
		})
	})

	prices, err := client.CheapestPrices([]string{"T1_FARM_CARROT_SEED"})
	require.NoError(t, err)
	_, ok := prices["T1_FARM_CARROT_SEED"]
	require.False(t, ok, "an item with no active listing should be absent, not zero")
}

func TestPriceClient_CheapestPrices_Empty(t *testing.T) {
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not make a request for an empty item list")
	})

	prices, err := client.CheapestPrices(nil)
	require.NoError(t, err)
	require.Empty(t, prices)
}

// @verified 2026-09-03: internal/market's Client caches for the same reason —
// polling the Albion Online Data Project faster than this just returns the
// same numbers and wastes their bandwidth. /api/farm/crops always requests
// the exact same fixed seed/harvest item list (see farm.List), so without
// this every page load/reload re-hit the upstream API.
func TestPriceClient_CheapestPrices_UsesCacheWithinTTL(t *testing.T) {
	calls := 0
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode([]priceRow{{ItemID: "T1_CARROT", SellPriceMin: 30}})
	})

	_, err := client.CheapestPrices([]string{"T1_CARROT"})
	require.NoError(t, err)
	_, err = client.CheapestPrices([]string{"T1_CARROT"})
	require.NoError(t, err)
	require.Equal(t, 1, calls, "the second call should be served from cache")

	client.cachedAt = time.Now().Add(-cacheTTL - time.Second)
	_, err = client.CheapestPrices([]string{"T1_CARROT"})
	require.NoError(t, err)
	require.Equal(t, 2, calls, "an expired cache entry should trigger a fresh request")
}

// @verified 2026-09-03: the cache is keyed by the exact item id list, not just
// "was there a recent call" — a differently-shaped request (a different set
// of items) must not be served stale data cached for a different list.
func TestPriceClient_CheapestPrices_CacheKeyedByItemList(t *testing.T) {
	calls := 0
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode([]priceRow{})
	})

	_, err := client.CheapestPrices([]string{"T1_CARROT"})
	require.NoError(t, err)
	_, err = client.CheapestPrices([]string{"T2_POTATO"})
	require.NoError(t, err)
	require.Equal(t, 2, calls, "a different item list must not be served from the other list's cache")
}

func TestPriceClient_CheapestPrices_UpstreamError(t *testing.T) {
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	_, err := client.CheapestPrices([]string{"T1_CARROT"})
	require.Error(t, err)
}
