package marketflip

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func newTestPublicPriceClient(t *testing.T, handler http.HandlerFunc) *PublicPriceClient {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &PublicPriceClient{httpClient: server.Client(), baseURL: server.URL}
}

func TestPublicPriceClient_PricesByCity_GroupsByCity(t *testing.T) {
	client := newTestPublicPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]publicPriceRow{
			{ItemID: "T4_BAG", City: "Lymhurst", SellPriceMin: 100, BuyPriceMax: 80},
			{ItemID: "T4_BAG", City: "Martlock", SellPriceMin: 150, BuyPriceMax: 200},
		})
	})

	prices, err := client.PricesByCity([]string{"T4_BAG"})
	require.NoError(t, err)
	require.Equal(t, CityPrice{SellPriceMin: 100, BuyPriceMax: 80}, prices["T4_BAG"]["Lymhurst"])
	require.Equal(t, CityPrice{SellPriceMin: 150, BuyPriceMax: 200}, prices["T4_BAG"]["Martlock"])
}

func TestPublicPriceClient_PricesByCity_IgnoresEmptyRows(t *testing.T) {
	client := newTestPublicPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]publicPriceRow{
			{ItemID: "T1_FARM_CARROT_SEED", City: "Lymhurst", SellPriceMin: 0, BuyPriceMax: 0},
		})
	})

	prices, err := client.PricesByCity([]string{"T1_FARM_CARROT_SEED"})
	require.NoError(t, err)
	require.Empty(t, prices)
}

func TestPublicPriceClient_PricesByCity_Empty(t *testing.T) {
	client := newTestPublicPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not make a request for an empty item list")
	})

	prices, err := client.PricesByCity(nil)
	require.NoError(t, err)
	require.Empty(t, prices)
}

func TestPublicOpportunities_SkipsItemsAlreadyCoveredPrivately(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100},
	}
	alreadyCovered := []Opportunity{{ItemID: "T4_BAG"}}

	client := newTestPublicPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not fetch public prices for an item Opportunities() already covered")
	})

	got, err := PublicOpportunities(orders, alreadyCovered, nil, client)
	require.NoError(t, err)
	require.Empty(t, got)
}

func TestPublicOpportunities_FillsGapForUncoveredItem(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100},
	}

	client := newTestPublicPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]publicPriceRow{
			{ItemID: "T4_BAG", City: "Lymhurst", SellPriceMin: 100, BuyPriceMax: 80},
			{ItemID: "T4_BAG", City: "Martlock", SellPriceMin: 150, BuyPriceMax: 200},
		})
	})

	got, err := PublicOpportunities(orders, nil, nil, client)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "T4_BAG", got[0].ItemID)
	require.Equal(t, "Lymhurst", got[0].BuyCity)
	require.Equal(t, int64(100), got[0].BuyPrice)
	require.Equal(t, "Martlock", got[0].SellCity)
	require.Equal(t, int64(200), got[0].SellPrice)
	require.Equal(t, int64(100), got[0].Spread)
	require.Equal(t, "public", got[0].Source)
}

func TestPublicOpportunities_NoItemsToLookUp(t *testing.T) {
	client := newTestPublicPriceClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not make a request when there are no orders at all")
	})

	got, err := PublicOpportunities(nil, nil, nil, client)
	require.NoError(t, err)
	require.Empty(t, got)
}
