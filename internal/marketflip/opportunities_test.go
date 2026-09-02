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
