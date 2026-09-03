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
	if resp.OperationCode != operationcodes.AuctionGetOffers && resp.OperationCode != operationcodes.AuctionGetRequests {
		return nil
	}

	// This whole feature was only verified against protocol documentation before
	// release, never against a live capture (see flip.gohtml's "in development"
	// notice) — this stays until that's confirmed, since it's the one thing that
	// tells us whether the game is even sending the response we expect, versus
	// a wrong opcode assumption or an unexpected Parameters[0] shape.
	logger.PrintInfo("MARKET", "auction response op=%d returnCode=%d paramCount=%d", resp.OperationCode, resp.ReturnCode, len(resp.Parameters))

	// Protocol18Deserializer already lifts the game's hijacked debug-message
	// slot into Parameters[0] as []string — see internal/photon/deserializer.go.
	raw, ok := resp.Parameters[0].([]string)
	if !ok || len(raw) == 0 {
		logger.PrintWarn("MARKET", "auction response op=%d had no usable order list in Parameters[0] (type %T)", resp.OperationCode, resp.Parameters[0])
		return nil
	}

	now := time.Now()
	orders := make([]Order, 0, len(raw))
	for _, ro := range ParseOrders(raw) {
		orders = append(orders, Order{
			AuctionID:        ro.ID,
			ItemID:           ro.ItemID,
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
	logger.PrintInfo("MARKET", "captured %d orders (op=%d, city=%q)", len(orders), resp.OperationCode, orders[0].City)
	return c.store.PutAll(orders)
}
