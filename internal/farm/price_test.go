package farm

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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

func TestPriceClient_CheapestPrices_UpstreamError(t *testing.T) {
	client := newTestPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	_, err := client.CheapestPrices([]string{"T1_CARROT"})
	require.Error(t, err)
}
