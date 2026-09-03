// Package marketflip captures Albion's item-marketplace order book (buy and
// sell listings) from the same passively-sniffed game traffic the rest of
// the Radar already decodes, and keeps it purely local — nothing here ever
// leaves the machine.
//
// The wire format was confirmed against the open-source albiondata-client
// (github.com/broderickhyman/albiondata-client), which does the same
// passive capture but uploads to a public API; this package intentionally
// stops after decoding and never uploads anywhere.
package marketflip

import "encoding/json"

// RawOrder mirrors the JSON payload Albion embeds in AuctionGetOffers and
// AuctionGetRequests responses (one JSON string per order). Field names
// match the game's own wire format, confirmed against albiondata-client's
// lib.MarketOrder struct.
type RawOrder struct {
	ID               int    `json:"Id"`
	ItemID           string `json:"ItemTypeId"`
	GroupTypeID      string `json:"ItemGroupTypeId"`
	LocationID       int    `json:"LocationId"`
	QualityLevel     int    `json:"QualityLevel"`
	EnchantmentLevel int    `json:"EnchantmentLevel"`
	UnitPriceSilver  int64  `json:"UnitPriceSilver"`
	Amount           int    `json:"Amount"`
	// AuctionType is "offer" (a sell listing — buyable via compra rápida)
	// or "request" (a buy order — sellable to it via venda rápida).
	AuctionType string `json:"AuctionType"`
	Expires     string `json:"Expires"`
}

// ParseOrders decodes each raw JSON-encoded order string, skipping any entry
// that fails to parse — the wire format isn't ours to control, and one bad
// entry shouldn't drop the rest of the batch.
func ParseOrders(raw []string) []RawOrder {
	orders := make([]RawOrder, 0, len(raw))
	for _, s := range raw {
		var o RawOrder
		if err := json.Unmarshal([]byte(s), &o); err != nil {
			continue
		}
		orders = append(orders, o)
	}
	return orders
}
