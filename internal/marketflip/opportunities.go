package marketflip

import "sort"

// Opportunity is one buy-here-sell-there suggestion for a single item
// variant, derived from the cities already captured — not a full route,
// just the best observed spread.
type Opportunity struct {
	ItemID           string `json:"itemId"`
	Category         string `json:"category"`
	Subcategory      string `json:"subcategory"`
	QualityLevel     int    `json:"qualityLevel"`
	EnchantmentLevel int    `json:"enchantmentLevel"`
	BuyCity          string `json:"buyCity"`
	BuyPrice         int64  `json:"buyPrice"`
	SellCity         string `json:"sellCity"`
	SellPrice        int64  `json:"sellPrice"`
	Spread           int64  `json:"spread"`
}

type variantKey struct {
	itemID           string
	qualityLevel     int
	enchantmentLevel int
}

// Opportunities groups captured orders by item variant and, for each one,
// compares the cheapest "offer" (a sell listing you can instantly buy) to
// the priciest "request" (a buy order you can instantly sell into) across
// every city that's been captured so far. Only cross-city, positive-spread
// pairs are returned, highest spread first.
//
// This does not account for the market sales tax Albion charges on a
// completed sale (varies with premium status and local vs. foreign
// registration) — the spread shown is the raw price difference.
func Opportunities(orders []Order) []Opportunity {
	cheapestOfferByVariant := map[variantKey]map[string]int64{}
	priciestRequestByVariant := map[variantKey]map[string]int64{}

	for _, o := range orders {
		if o.City == "" {
			continue
		}
		k := variantKey{o.ItemID, o.QualityLevel, o.EnchantmentLevel}
		switch o.AuctionType {
		case "offer":
			byCity := cheapestOfferByVariant[k]
			if byCity == nil {
				byCity = map[string]int64{}
				cheapestOfferByVariant[k] = byCity
			}
			if cur, ok := byCity[o.City]; !ok || o.UnitPriceSilver < cur {
				byCity[o.City] = o.UnitPriceSilver
			}
		case "request":
			byCity := priciestRequestByVariant[k]
			if byCity == nil {
				byCity = map[string]int64{}
				priciestRequestByVariant[k] = byCity
			}
			if cur, ok := byCity[o.City]; !ok || o.UnitPriceSilver > cur {
				byCity[o.City] = o.UnitPriceSilver
			}
		}
	}

	var opportunities []Opportunity
	for k, offersByCity := range cheapestOfferByVariant {
		requestsByCity, ok := priciestRequestByVariant[k]
		if !ok {
			continue
		}

		// Compare every (buy city, sell city) pair rather than greedily locking
		// in the single globally-cheapest offer city first: the city with the
		// cheapest offer isn't necessarily part of the best spread — it can
		// also happen to have a low request price (a bad place to sell), while
		// a slightly pricier offer city pairs with a much better sell city
		// elsewhere. City counts here are small (the handful of captured
		// market hubs), so the extra pass is cheap. Cities are visited in
		// sorted order so a tie always resolves to the same pair instead of
		// flickering between requests due to Go's randomized map iteration.
		buyCities := sortedCityNames(offersByCity)
		sellCities := sortedCityNames(requestsByCity)

		var best Opportunity
		bestSpread := int64(-1)
		for _, buyCity := range buyCities {
			buyPrice := offersByCity[buyCity]
			for _, sellCity := range sellCities {
				if sellCity == buyCity {
					continue
				}
				sellPrice := requestsByCity[sellCity]
				spread := sellPrice - buyPrice
				if spread > bestSpread {
					bestSpread = spread
					category, subcategory := Category(k.itemID)
					best = Opportunity{
						ItemID:           k.itemID,
						Category:         category,
						Subcategory:      subcategory,
						QualityLevel:     k.qualityLevel,
						EnchantmentLevel: k.enchantmentLevel,
						BuyCity:          buyCity,
						BuyPrice:         buyPrice,
						SellCity:         sellCity,
						SellPrice:        sellPrice,
						Spread:           spread,
					}
				}
			}
		}

		if bestSpread <= 0 {
			continue
		}
		opportunities = append(opportunities, best)
	}

	sort.Slice(opportunities, func(i, j int) bool {
		return opportunities[i].Spread > opportunities[j].Spread
	})
	return opportunities
}

// sortedCityNames returns byCity's keys in a fixed (alphabetical) order, so
// callers that break ties by "first city visited" get a deterministic result
// instead of one that depends on Go's randomized map iteration order.
func sortedCityNames(byCity map[string]int64) []string {
	names := make([]string, 0, len(byCity))
	for city := range byCity {
		names = append(names, city)
	}
	sort.Strings(names)
	return names
}
