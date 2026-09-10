package marketflip

import (
	"time"

	"github.com/nospy/albion-openradar/internal/logger"
	"github.com/nospy/albion-openradar/internal/photon"
	"github.com/nospy/albion-openradar/internal/photon/operationcodes"
)

// Capture listens for AuctionGetOffers/AuctionGetRequests responses — the
// two operations the game sends the current order book on when a player
// opens a market screen (confirmed against albiondata-client, which reacts
// to the same two responses) — and turns each order into a locally stored
// Order. It never talks to the network itself.
type Capture struct {
	zones *ZoneIndex
	store *Store
}

func NewCapture(zones *ZoneIndex, store *Store) *Capture {
	return &Capture{zones: zones, store: store}
}

// HandleResponse is meant to be called from the app's onPhotonResponse
// callback, after photon.PostProcessResponse has run. It's a no-op for any
// response that isn't a market order list.
func (c *Capture) HandleResponse(resp *photon.OperationResponse) error {
	if resp == nil {
		return nil
	}

	// Under Protocol18 the wire-level OperationCode byte is always 1 (a
	// generic dispatch value) — the real operation code lives in
	// Parameters[253] as an int, guaranteed present by PostProcessResponse
	// (backfilled from OperationCode if the wire didn't carry it). Comparing
	// resp.OperationCode directly — as this used to — could never match real
	// traffic, which is why Flip never captured anything.
	code := realOperationCode(resp.Parameters)
	if code != operationcodes.AuctionGetOffers && code != operationcodes.AuctionGetRequests {
		return nil
	}

	logger.PrintInfo("MARKET", "auction response op=%d returnCode=%d paramCount=%d", code, resp.ReturnCode, len(resp.Parameters))

	// Protocol18Deserializer already lifts the game's hijacked debug-message
	// slot into Parameters[0] as []string — see internal/photon/deserializer.go.
	raw, ok := resp.Parameters[0].([]string)
	if !ok || len(raw) == 0 {
		logger.PrintWarn("MARKET", "auction response op=%d had no usable order list in Parameters[0] (type %T)", code, resp.Parameters[0])
		return nil
	}

	now := time.Now()
	orders := make([]Order, 0, len(raw))
	for _, ro := range ParseOrders(raw) {
		category, subcategory := Category(ro.ItemID)
		orders = append(orders, Order{
			AuctionID:        ro.ID,
			ItemID:           ro.ItemID,
			Category:         category,
			Subcategory:      subcategory,
			QualityLevel:     ro.QualityLevel,
			EnchantmentLevel: ro.EnchantmentLevel,
			City:             c.zones.CityName(ro.LocationID),
			LocationID:       ro.LocationID,
			AuctionType:      ro.AuctionType,
			UnitPriceSilver:  ro.UnitPriceSilver,
			Amount:           ro.Amount,
			Expires:          ro.Expires,
			CapturedAt:       now,
		})
	}
	if len(orders) == 0 {
		logger.PrintWarn("MARKET", "auction response op=%d had %d raw entries but none parsed into an Order", resp.OperationCode, len(raw))
		return nil
	}
	logger.PrintInfo("MARKET", "captured %d orders (op=%d, city=%q)", len(orders), code, orders[0].City)
	return c.store.PutAll(orders)
}

// realOperationCode reads Albion's real operation code out of Parameters[253].
// Protocol18 only guarantees an int-family type there (see
// internal/photon/events.go's PostProcessResponse and doc.go); the wire's own
// OperationResponse.OperationCode byte is not it.
func realOperationCode(params map[byte]interface{}) int {
	switch v := params[253].(type) {
	case byte:
		return int(v)
	case int8:
		return int(v)
	case int16:
		return int(v)
	case int32:
		return int(v)
	case int64:
		return int(v)
	default:
		return -1
	}
}
