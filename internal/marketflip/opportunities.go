package marketflip

import "sort"

// Opportunity is one buy-here-sell-there suggestion for a single item
// variant, derived from the cities already captured — not a full route,
// just the best observed spread.
type Opportunity struct {
	ItemID           string `json:"itemId"`
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

		var bestBuyCity string
		var bestBuyPrice int64 = -1
		for city, price := range offersByCity {
			if bestBuyPrice == -1 || price < bestBuyPrice {
				bestBuyCity, bestBuyPrice = city, price
			}
		}

		var bestSellCity string
		var bestSellPrice int64 = -1
		for city, price := range requestsByCity {
			if city == bestBuyCity {
				continue
			}
			if price > bestSellPrice {
				bestSellCity, bestSellPrice = city, price
			}
		}

		if bestSellCity == "" || bestSellPrice <= bestBuyPrice {
			continue
		}

		opportunities = append(opportunities, Opportunity{
			ItemID:           k.itemID,
			QualityLevel:     k.qualityLevel,
			EnchantmentLevel: k.enchantmentLevel,
			BuyCity:          bestBuyCity,
			BuyPrice:         bestBuyPrice,
			SellCity:         bestSellCity,
			SellPrice:        bestSellPrice,
			Spread:           bestSellPrice - bestBuyPrice,
		})
	}

	sort.Slice(opportunities, func(i, j int) bool {
		return opportunities[i].Spread > opportunities[j].Spread
	})
	return opportunities
}
