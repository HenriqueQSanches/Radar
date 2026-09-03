package marketflip

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOpportunities_FindsCrossCitySpread(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 1000},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "offer", UnitPriceSilver: 1200},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 1500},
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "request", UnitPriceSilver: 900},
	}

	got := Opportunities(orders)

	require.Len(t, got, 1)
	require.Equal(t, "T4_BAG", got[0].ItemID)
	require.Equal(t, "Lymhurst", got[0].BuyCity)
	require.Equal(t, int64(1000), got[0].BuyPrice)
	require.Equal(t, "Martlock", got[0].SellCity)
	require.Equal(t, int64(1500), got[0].SellPrice)
	require.Equal(t, int64(500), got[0].Spread)
}

func TestOpportunities_IgnoresSameCityOnlySpread(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 1000},
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "request", UnitPriceSilver: 1500},
	}

	require.Empty(t, Opportunities(orders))
}

func TestOpportunities_IgnoresNegativeSpread(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 2000},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 1500},
	}

	require.Empty(t, Opportunities(orders))
}

func TestOpportunities_SkipsOrdersWithoutCity(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "", AuctionType: "offer", UnitPriceSilver: 100},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 1500},
	}

	require.Empty(t, Opportunities(orders))
}

// @verified 2026-09-01: the previous algorithm locked in the single globally
// cheapest offer city, then searched only for the best sell city excluding
// that one — missing that the cheapest-offer city can itself be the best
// place to sell. City A has the cheapest offer (100) but also has a much
// higher request price (5000); City B has a slightly pricier offer (101) but
// a low request price (200). The true best flip is "buy B, sell A" (spread
// 4899), not "buy A (cheapest), sell B" (spread 100).
func TestOpportunities_ConsidersEveryBuySellCityPair(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "CityA", AuctionType: "offer", UnitPriceSilver: 100},
		{ItemID: "T4_BAG", City: "CityB", AuctionType: "offer", UnitPriceSilver: 101},
		{ItemID: "T4_BAG", City: "CityA", AuctionType: "request", UnitPriceSilver: 5000},
		{ItemID: "T4_BAG", City: "CityB", AuctionType: "request", UnitPriceSilver: 200},
	}

	got := Opportunities(orders)

	require.Len(t, got, 1)
	require.Equal(t, "CityB", got[0].BuyCity)
	require.Equal(t, int64(101), got[0].BuyPrice)
	require.Equal(t, "CityA", got[0].SellCity)
	require.Equal(t, int64(5000), got[0].SellPrice)
	require.Equal(t, int64(4899), got[0].Spread)
}

// @verified 2026-09-01: a tie on the best spread must resolve to the same
// pair every time (alphabetically-first city), not flicker between calls due
// to Go's randomized map iteration order — run it enough times that a flaky
// map-order dependency would almost certainly show up as a mismatch.
func TestOpportunities_TiedSpreadIsDeterministic(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Bridgewatch", AuctionType: "offer", UnitPriceSilver: 100},
		{ItemID: "T4_BAG", City: "Caerleon", AuctionType: "offer", UnitPriceSilver: 100},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 200},
	}

	for i := range 50 {
		got := Opportunities(orders)
		require.Len(t, got, 1)
		require.Equal(t, "Bridgewatch", got[0].BuyCity, "iteration %d", i)
	}
}

func TestOpportunities_SortedBySpreadDescending(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 1000},
		{ItemID: "T4_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 1100},

		{ItemID: "T5_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 1000},
		{ItemID: "T5_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 5000},
	}

	got := Opportunities(orders)
	require.Len(t, got, 2)
	require.Equal(t, "T5_BAG", got[0].ItemID, "bigger spread first")
	require.Equal(t, "T4_BAG", got[1].ItemID)
}

func TestOpportunities_TagsCategoryAndSubcategory(t *testing.T) {
	orders := []Order{
		{ItemID: "T4_ORE", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100},
		{ItemID: "T4_ORE", City: "Martlock", AuctionType: "request", UnitPriceSilver: 200},
	}

	got := Opportunities(orders)
	require.Len(t, got, 1)
	require.Equal(t, "resources", got[0].Category)
	require.Equal(t, "Minério", got[0].Subcategory)
}
