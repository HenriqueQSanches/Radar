package marketflip

import (
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nospy/albion-openradar/internal/logger"
	"github.com/nospy/albion-openradar/internal/photon"
	"github.com/nospy/albion-openradar/internal/photon/operationcodes"
)

// silverScale is Albion's wire-level scaling factor for silver amounts —
// UnitPriceSilver arrives multiplied by 10000 (same convention every
// albiondata-client-derived tool divides back out before display).
const silverScale = 10000

// Capture listens for AuctionGetOffers/AuctionGetRequests responses — the
// two operations the game sends the current order book on when a player
// opens a market screen (confirmed against albiondata-client, which reacts
// to the same two responses) — and turns each order into a locally stored
// Order. It never talks to the network itself.
//
// Market orders never carry a usable per-order LocationId on real traffic
// (only ever verified against protocol docs/synthetic fixtures before —
// live capture showed every order landing with City ""), so the city is
// tracked separately from JoinFinished/ChangeCluster responses, which do
// carry the player's current map, and stamped onto every order captured
// afterward.
type Capture struct {
	zones *ZoneIndex
	items *ItemIndex
	store *Store

	mu          sync.Mutex
	currentCity string
}

// items may be nil (e.g. items.min.json failed to load) — Category
// classification then simply stays empty for anything that isn't a
// raw/refined resource, same as before ItemIndex existed.
func NewCapture(zones *ZoneIndex, items *ItemIndex, store *Store) *Capture {
	return &Capture{zones: zones, items: items, store: store}
}

// HandleResponse is meant to be called from the app's onPhotonResponse
// callback, after photon.PostProcessResponse has run. It's a no-op for any
// response that isn't a market order list or a map-change response.
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

	switch code {
	case operationcodes.Join:
		c.updateCurrentCity(resp.Parameters[8])
		return nil
	case operationcodes.ChangeCluster:
		c.updateCurrentCity(resp.Parameters[0])
		return nil
	}

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

	city := c.getCurrentCity()
	now := time.Now()
	orders := make([]Order, 0, len(raw))
	for _, ro := range ParseOrders(raw) {
		category, subcategory := Category(ro.ItemID)
		if category == "" {
			category, subcategory = c.items.Classify(ro.ItemID)
		}
		orderCity := city
		if orderCity == "" {
			// Belt-and-suspenders: use the order's own LocationId if it's
			// ever actually populated (never observed live so far, but
			// costs nothing to prefer real data over the tracked fallback).
			orderCity = c.zones.CityName(ro.LocationID)
		}
		orders = append(orders, Order{
			AuctionID:        ro.ID,
			ItemID:           ro.ItemID,
			Category:         category,
			Subcategory:      subcategory,
			QualityLevel:     ro.QualityLevel,
			EnchantmentLevel: ro.EnchantmentLevel,
			City:             orderCity,
			LocationID:       ro.LocationID,
			AuctionType:      ro.AuctionType,
			UnitPriceSilver:  ro.UnitPriceSilver / silverScale,
			Amount:           ro.Amount,
			Expires:          ro.Expires,
			CapturedAt:       now,
		})
	}
	if len(orders) == 0 {
		logger.PrintWarn("MARKET", "auction response op=%d had %d raw entries but none parsed into an Order", code, len(raw))
		return nil
	}
	logger.PrintInfo("MARKET", "captured %d orders (op=%d, city=%q)", len(orders), code, orders[0].City)
	return c.store.PutAll(orders)
}

// updateCurrentCity resolves a JoinFinished/ChangeCluster mapId param (a
// string, possibly compound like "1234-5" — see web/scripts/data/
// ZonesDatabase.js's getZone for the same base-id-split convention on the
// frontend) into a city name and stores it for subsequent orders. A mapId
// that doesn't resolve to a known city (e.g. an instanced dungeon) clears
// the tracked city rather than keeping a stale one.
func (c *Capture) updateCurrentCity(mapIDParam interface{}) {
	mapID, ok := mapIDParam.(string)
	if !ok {
		return
	}
	base := mapID
	if i := strings.IndexByte(mapID, '-'); i >= 0 {
		base = mapID[:i]
	}
	id, err := strconv.Atoi(base)
	city := ""
	if err == nil {
		city = c.zones.CityName(id)
	}
	c.mu.Lock()
	c.currentCity = city
	c.mu.Unlock()
}

func (c *Capture) getCurrentCity() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.currentCity
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
