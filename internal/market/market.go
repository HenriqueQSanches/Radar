// Package market fetches raw-resource and fish sell prices from the Albion
// Online Data Project's public API (no local Albion Data Client needed —
// that app only contributes data, it doesn't gate reading it).
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

// fishDef is one fish family; tiers 4-8 are queried for each, at enchant 0
// only (fish doesn't carry enchantment).
type fishDef struct {
	code string // wire code suffix, e.g. "FRESHWATER_ALL_COMMON"
	name string // PT-BR display name
}

var fishTypes = []fishDef{
	{"FRESHWATER_ALL_COMMON", "Peixe de Água Doce"},
	{"FRESHWATER_ALL_RARE", "Peixe de Água Doce Raro"},
	{"SALTWATER_ALL_COMMON", "Peixe de Água Salgada"},
	{"SALTWATER_ALL_RARE", "Peixe de Água Salgada Raro"},
}

// itemMeta maps an Albion Online Data Project item_id back to the
// resource/tier/enchant it represents.
type itemMeta struct {
	resource string
	tier     int
	enchant  int
}

// buildItems returns every raw-resource item id to query — T2-T8 base
// resources, plus the @1 (enchant 1) variant for T4-T8 (raw resources aren't
// enchantable below T4, matching the Resources settings grid) — and a lookup
// from item id back to resource/tier/enchant for reading the response.
func buildItems() (ids []string, meta map[string]itemMeta) {
	const tierCount = 7 // T2-T8
	ids = make([]string, 0, len(resources)*tierCount*2)
	meta = make(map[string]itemMeta, len(resources)*tierCount*2)
	for _, r := range resources {
		for tier := 2; tier <= 8; tier++ {
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

// buildFishItems returns every fish item id to query — T4-T8, freshwater and
// saltwater, common and rare — and its resource/tier lookup.
func buildFishItems() (ids []string, meta map[string]itemMeta) {
	const tierCount = 5 // T4-T8
	ids = make([]string, 0, len(fishTypes)*tierCount)
	meta = make(map[string]itemMeta, len(fishTypes)*tierCount)
	for _, f := range fishTypes {
		for tier := 4; tier <= 8; tier++ {
			id := fmt.Sprintf("T%d_FISH_%s", tier, f.code)
			ids = append(ids, id)
			meta[id] = itemMeta{resource: f.name, tier: tier}
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

// Client fetches and caches price lists for one region.
type Client struct {
	region     Region
	httpClient *http.Client
	// baseURL defaults to the region's real host; tests override it to point
	// at an httptest.Server instead of the live API.
	baseURL string

	mu           sync.Mutex
	routeCache   []Entry
	routeCached  time.Time
	fishCache    []Entry
	fishCachedAt time.Time
}

func NewClient(region Region) *Client {
	return &Client{
		region:     region,
		httpClient: &http.Client{Timeout: requestTimeout},
		baseURL:    fmt.Sprintf("https://%s.albion-online-data.com", region),
	}
}

// fetchEntries queries the Data Project for the given items across the
// standard cities and returns one Entry per (item, city) with an active sell
// order, resolved through meta. Unlisted item ids (not present in meta) and
// zero-price rows (no active sell orders) are dropped.
func (c *Client) fetchEntries(ids []string, meta map[string]itemMeta) ([]Entry, error) {
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

	return entries, nil
}

// BestRoute returns every T2-T8 (and T4.1-T8.1) resource's sell price across
// the standard trade cities, highest price first. Results are cached for
// cacheTTL.
func (c *Client) BestRoute() ([]Entry, error) {
	c.mu.Lock()
	if c.routeCache != nil && time.Since(c.routeCached) < cacheTTL {
		cached := c.routeCache
		c.mu.Unlock()
		return cached, nil
	}
	c.mu.Unlock()

	ids, meta := buildItems()
	entries, err := c.fetchEntries(ids, meta)
	if err != nil {
		return nil, err
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Price > entries[j].Price })

	c.mu.Lock()
	c.routeCache = entries
	c.routeCached = time.Now()
	c.mu.Unlock()

	return entries, nil
}

// CityRanking is one city's average raw-resource sell price, used to answer
// "which city is selling resources for more, overall" rather than "which
// resource sells for more, and where" (that's BestRoute).
type CityRanking struct {
	City         string  `json:"city"`
	AveragePrice float64 `json:"averagePrice"`
	SampleCount  int     `json:"sampleCount"`
}

// BestCities ranks each of the standard trade cities by its average
// T2-T8 resource sell price, highest average first. It reuses BestRoute's
// (cached) entries rather than issuing a separate request.
func (c *Client) BestCities() ([]CityRanking, error) {
	entries, err := c.BestRoute()
	if err != nil {
		return nil, err
	}

	sums := make(map[string]int)
	counts := make(map[string]int)
	for _, e := range entries {
		sums[e.City] += e.Price
		counts[e.City]++
	}

	rankings := make([]CityRanking, 0, len(sums))
	for city, sum := range sums {
		rankings = append(rankings, CityRanking{
			City:         city,
			AveragePrice: float64(sum) / float64(counts[city]),
			SampleCount:  counts[city],
		})
	}

	sort.Slice(rankings, func(i, j int) bool { return rankings[i].AveragePrice > rankings[j].AveragePrice })

	return rankings, nil
}

// FishPrices returns every T4-T8 fish family's sell price across the
// standard trade cities, highest price first — same shape as BestRoute, just
// for fish instead of raw resources. Results are cached for cacheTTL.
func (c *Client) FishPrices() ([]Entry, error) {
	c.mu.Lock()
	if c.fishCache != nil && time.Since(c.fishCachedAt) < cacheTTL {
		cached := c.fishCache
		c.mu.Unlock()
		return cached, nil
	}
	c.mu.Unlock()

	ids, meta := buildFishItems()
	entries, err := c.fetchEntries(ids, meta)
	if err != nil {
		return nil, err
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Price > entries[j].Price })

	c.mu.Lock()
	c.fishCache = entries
	c.fishCachedAt = time.Now()
	c.mu.Unlock()

	return entries, nil
}
