package marketflip

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Cities are the standard trade hubs, same list internal/market and
// internal/farm already use.
var publicPriceCities = []string{"Thetford", "Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Caerleon"}

const publicPriceRequestTimeout = 10 * time.Second

// publicPriceCacheTTL matches internal/farm's PriceClient — polling the
// Albion Online Data Project's public API faster than this just returns the
// same numbers and wastes their bandwidth.
const publicPriceCacheTTL = 60 * time.Second

type publicPriceRow struct {
	ItemID       string `json:"item_id"`
	City         string `json:"city"`
	SellPriceMin int64  `json:"sell_price_min"`
	BuyPriceMax  int64  `json:"buy_price_max"`
}

// CityPrice is one city's best-known public prices for an item: the
// cheapest active sell listing (what Flip calls an "offer") and the
// highest active buy order (what Flip calls a "request").
type CityPrice struct {
	SellPriceMin int64
	BuyPriceMax  int64
}

// PublicPriceClient fetches per-city market prices from the Albion Online
// Data Project's public API — the same crowdsourced database albiondata-client
// uploads to. It's only ever read here, as a fallback for items Flip hasn't
// captured enough of locally to compute its own cross-city opportunity (see
// internal/marketflip's package doc: Flip's own captures never leave the
// machine; this client is the one place marketflip talks to the network,
// and only to download, never to upload).
type PublicPriceClient struct {
	httpClient *http.Client
	baseURL    string

	mu       sync.Mutex
	cache    map[string]map[string]CityPrice
	cacheKey string
	cachedAt time.Time
}

func NewPublicPriceClient() *PublicPriceClient {
	return &PublicPriceClient{
		httpClient: &http.Client{Timeout: publicPriceRequestTimeout},
		baseURL:    "https://west.albion-online-data.com",
	}
}

// PricesByCity returns, for each item id that has at least one active
// listing, a map of city name to that city's best sell/buy prices. An item
// with no data anywhere is simply absent from the result (not an error).
func (c *PublicPriceClient) PricesByCity(itemIDs []string) (map[string]map[string]CityPrice, error) {
	if len(itemIDs) == 0 {
		return map[string]map[string]CityPrice{}, nil
	}

	key := strings.Join(itemIDs, ",")

	c.mu.Lock()
	if c.cache != nil && c.cacheKey == key && time.Since(c.cachedAt) < publicPriceCacheTTL {
		cached := c.cache
		c.mu.Unlock()
		return cached, nil
	}
	c.mu.Unlock()

	encodedCities := make([]string, len(publicPriceCities))
	for i, city := range publicPriceCities {
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

	var rows []publicPriceRow
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("parsing albion online data project response: %w", err)
	}

	prices := make(map[string]map[string]CityPrice, len(itemIDs))
	for _, row := range rows {
		if row.SellPriceMin <= 0 && row.BuyPriceMax <= 0 {
			continue
		}
		byCity := prices[row.ItemID]
		if byCity == nil {
			byCity = map[string]CityPrice{}
			prices[row.ItemID] = byCity
		}
		byCity[row.City] = CityPrice{SellPriceMin: row.SellPriceMin, BuyPriceMax: row.BuyPriceMax}
	}

	c.mu.Lock()
	c.cache = prices
	c.cacheKey = key
	c.cachedAt = time.Now()
	c.mu.Unlock()

	return prices, nil
}
