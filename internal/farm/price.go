package farm

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Cities are the standard trade hubs, same list internal/market uses.
var Cities = []string{"Thetford", "Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Caerleon"}

const requestTimeout = 10 * time.Second

type priceRow struct {
	ItemID       string `json:"item_id"`
	SellPriceMin int64  `json:"sell_price_min"`
}

// PriceClient fetches the cheapest active sell price for arbitrary item ids
// from the Albion Online Data Project's public API — the same one
// internal/market already uses, just not limited to a fixed resource list
// since the farm calculator needs prices for specific seed/harvest items.
type PriceClient struct {
	httpClient *http.Client
	baseURL    string
}

func NewPriceClient() *PriceClient {
	return &PriceClient{
		httpClient: &http.Client{Timeout: requestTimeout},
		baseURL:    "https://west.albion-online-data.com",
	}
}

// CheapestPrices returns the lowest active sell price for each of the given
// item ids across the standard trade cities, in one batched request. An
// item with no active sell order anywhere is simply absent from the result
// (not an error) — callers should treat a missing entry as "no price data".
func (c *PriceClient) CheapestPrices(itemIDs []string) (map[string]int64, error) {
	if len(itemIDs) == 0 {
		return map[string]int64{}, nil
	}

	encodedCities := make([]string, len(Cities))
	for i, city := range Cities {
		encodedCities[i] = url.QueryEscape(city)
	}

	reqURL := fmt.Sprintf(
		"%s/api/v2/stats/prices/%s.json?locations=%s&qualities=1",
		c.baseURL, strings.Join(itemIDs, ","), strings.Join(encodedCities, ","),
	)

	resp, err := c.httpClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("albion online data project request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("albion online data project returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading albion online data project response: %w", err)
	}

	var rows []priceRow
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("parsing albion online data project response: %w", err)
	}

	prices := make(map[string]int64, len(itemIDs))
	for _, row := range rows {
		if row.SellPriceMin <= 0 {
			continue
		}
		if cur, ok := prices[row.ItemID]; !ok || row.SellPriceMin < cur {
			prices[row.ItemID] = row.SellPriceMin
		}
	}
	return prices, nil
}
