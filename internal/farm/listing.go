package farm

import "sort"

// PricedCrop is one crop/herb with its current cheapest observed price for
// both the seed and the harvested product, ready for the frontend to run
// the profit calculation against (and to let the user override either
// price, since seed prices swing a lot city to city and day to day).
type PricedCrop struct {
	Tier          int     `json:"tier"`
	Name          string  `json:"name"`
	Kind          string  `json:"kind"` // "crop" or "herb"
	SeedItemID    string  `json:"seedItemId"`
	SeedPrice     int64   `json:"seedPrice"`
	HarvestItemID string  `json:"harvestItemId"`
	HarvestPrice  int64   `json:"harvestPrice"`
	GrowthHours   float64 `json:"growthHours"`
}

// List fetches current prices for every crop and herb in one batched
// request and returns them tagged with their Kind, sorted by kind then
// tier — the same order the reference tables (and the AlbionOracle page
// this was modeled on) present them in.
func List(client *PriceClient) ([]PricedCrop, error) {
	all := append(append([]Crop{}, Crops...), Herbs...)

	itemIDs := make([]string, 0, len(all)*2)
	for _, c := range all {
		itemIDs = append(itemIDs, c.SeedItemID, c.HarvestItemID)
	}

	prices, err := client.CheapestPrices(itemIDs)
	if err != nil {
		return nil, err
	}

	out := make([]PricedCrop, 0, len(all))
	for _, c := range Crops {
		out = append(out, priced(c, "crop", prices))
	}
	for _, c := range Herbs {
		out = append(out, priced(c, "herb", prices))
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind // "crop" before "herb"
		}
		return out[i].Tier < out[j].Tier
	})
	return out, nil
}

func priced(c Crop, kind string, prices map[string]int64) PricedCrop {
	return PricedCrop{
		Tier:          c.Tier,
		Name:          c.Name,
		Kind:          kind,
		SeedItemID:    c.SeedItemID,
		SeedPrice:     prices[c.SeedItemID],
		HarvestItemID: c.HarvestItemID,
		HarvestPrice:  prices[c.HarvestItemID],
		GrowthHours:   GrowthHours,
	}
}
