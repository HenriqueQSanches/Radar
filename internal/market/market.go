// Package market fetches raw-resource sell prices from the Albion Online
// Data Project's public API (no local Albion Data Client needed — that app
// only contributes data, it doesn't gate reading it).
package market

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// Region is an Albion Online Data Project server host.
type Region string

const (
	RegionAmericas Region = "west"
	RegionEurope   Region = "europe"
	RegionAsia     Region = "asia"
)

// Cities are the main trade hubs; Black Market/Brecilien are deliberately
// excluded (much thinner order books, noisy "best price" results).
var Cities = []string{"Thetford", "Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Caerleon"}

type resourceDef struct {
	code string // wire code used in the item id, e.g. "WOOD"
	name string // PT-BR display name
}

var resources = []resourceDef{
	{"WOOD", "Madeira"},
	{"ROCK", "Pedra"},
	{"FIBER", "Fibra"},
	{"HIDE", "Couro"},
	{"ORE", "Minério"},
}

// itemMeta maps an Albion Online Data Project item_id back to the
// resource/tier/enchant it represents.
type itemMeta struct {
	resource string
	tier     int
	enchant  int
}

// buildItems returns every item id to query — T3-T5 base resources, plus the
// @1 (enchant 1) variant for T4 and T5 only, per the feature's scope — and a
// lookup from item id back to resource/tier/enchant for reading the response.
func buildItems() (ids []string, meta map[string]itemMeta) {
	ids = make([]string, 0, 25)
	meta = make(map[string]itemMeta, 25)
	for _, r := range resources {
		for tier := 3; tier <= 5; tier++ {
			id := fmt.Sprintf("T%d_%s", tier, r.code)
			ids = append(ids, id)
			meta[id] = itemMeta{resource: r.name, tier: tier, enchant: 0}
			if tier >= 4 {
				enchantedID := id + "@1"
				ids = append(ids, enchantedID)
				meta[enchantedID] = itemMeta{resource: r.name, tier: tier, enchant: 1}
			}
		}
	}
	return ids, meta
}

// Entry is one resource/tier/enchant sell price at one city.
type Entry struct {
	Resource  string `json:"resource"`
	Tier      int    `json:"tier"`
	Enchant   int    `json:"enchant"`
	City      string `json:"city"`
	Price     int    `json:"price"`
	UpdatedAt string `json:"updatedAt"`
}

type apiRow struct {
	ItemID           string `json:"item_id"`
	City             string `json:"city"`
	SellPriceMin     int    `json:"sell_price_min"`
	SellPriceMinDate string `json:"sell_price_min_date"`
}

// cacheTTL matches the Data Project's own update cadence for market orders;
// polling faster would just return the same numbers and waste their bandwidth.
const cacheTTL = 60 * time.Second

const requestTimeout = 10 * time.Second

// Client fetches and caches the best-route price list for one region.
type Client struct {
	region     Region
	httpClient *http.Client
	// baseURL defaults to the region's real host; tests override it to point
	// at an httptest.Server instead of the live API.
	baseURL string

	mu       sync.Mutex
	cache    []Entry
	cachedAt time.Time
}

func NewClient(region Region) *Client {
	return &Client{
		region:     region,
		httpClient: &http.Client{Timeout: requestTimeout},
		baseURL:    fmt.Sprintf("https://%s.albion-online-data.com", region),
	}
}

// BestRoute returns every T3-T5 (and T4.1/T5.1) resource's sell price across
// the standard trade cities, highest price first. Zero-price entries (no
// active sell orders) are dropped. Results are cached for cacheTTL.
func (c *Client) BestRoute() ([]Entry, error) {
	c.mu.Lock()
	if c.cache != nil && time.Since(c.cachedAt) < cacheTTL {
		cached := c.cache
		c.mu.Unlock()
		return cached, nil
	}
	c.mu.Unlock()

	ids, meta := buildItems()

	// City names contain spaces ("Fort Sterling") that must be percent-encoded;
	// item ids don't need it ("@" and "," are both valid unencoded in a query).
	encodedCities := make([]string, len(Cities))
	for i, city := range Cities {
		encodedCities[i] = url.QueryEscape(city)
	}

	reqURL := fmt.Sprintf(
		"%s/api/v2/stats/prices/%s.json?locations=%s&qualities=1",
		c.baseURL, strings.Join(ids, ","), strings.Join(encodedCities, ","),
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

	var rows []apiRow
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("parsing albion online data project response: %w", err)
	}

	entries := make([]Entry, 0, len(rows))
	for _, row := range rows {
		if row.SellPriceMin <= 0 {
			continue
		}
		m, ok := meta[row.ItemID]
		if !ok {
			continue
		}
		entries = append(entries, Entry{
			Resource:  m.resource,
			Tier:      m.tier,
			Enchant:   m.enchant,
			City:      row.City,
			Price:     row.SellPriceMin,
			UpdatedAt: row.SellPriceMinDate,
		})
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Price > entries[j].Price })

	c.mu.Lock()
	c.cache = entries
	c.cachedAt = time.Now()
	c.mu.Unlock()

	return entries, nil
}
