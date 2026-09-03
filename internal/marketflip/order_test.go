package marketflip

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseOrders(t *testing.T) {
	raw := []string{
		`{"Id":1,"ItemTypeId":"T4_BAG","ItemGroupTypeId":"BAG","LocationId":1000,"QualityLevel":1,"EnchantmentLevel":0,"UnitPriceSilver":15000,"Amount":3,"AuctionType":"offer","Expires":"2026-09-10T00:00:00Z"}`,
		`not json`,
		`{"Id":2,"ItemTypeId":"T5_BAG","LocationId":1002,"QualityLevel":2,"UnitPriceSilver":30000,"Amount":1,"AuctionType":"request"}`,
	}

	orders := ParseOrders(raw)

	require.Len(t, orders, 2)
	require.Equal(t, "T4_BAG", orders[0].ItemID)
	require.Equal(t, 1000, orders[0].LocationID)
	require.Equal(t, int64(15000), orders[0].UnitPriceSilver)
	require.Equal(t, "offer", orders[0].AuctionType)

	require.Equal(t, "T5_BAG", orders[1].ItemID)
	require.Equal(t, "request", orders[1].AuctionType)
}

func TestParseOrders_Empty(t *testing.T) {
	require.Empty(t, ParseOrders(nil))
	require.Empty(t, ParseOrders([]string{}))
}
