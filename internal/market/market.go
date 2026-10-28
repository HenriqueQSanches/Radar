// Package market fetches raw-resource sell prices from the Albion
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

	mu          sync.Mutex
	routeCache  []Entry
	routeCached time.Time
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

// maxAge is how old a price may be and still count as "today's" price. The
// Data Project only knows a price from the last player with the Data Client
// who opened that market, so an older observation is more likely to be gone.
const maxAge = 24 * time.Hour

// TopPrice is the answer to "which raw resource is selling for the most right
// now, and where": the single highest sell price across every resource, tier
// and city with a fresh enough observation, plus the next best entries so the
// player can compare, and how many stale rows were ignored.
type TopPrice struct {
	Best    *TopEntry  `json:"best"`
	Runners []TopEntry `json:"runners"`
	Stale   int        `json:"stale"`
}

// TopEntry is an Entry with the observation's age already computed.
type TopEntry struct {
	Entry
	AgeMinutes int `json:"ageMinutes"`
}

// dataProjectTime is the API's timestamp layout: ISO 8601 without a zone, in UTC.
const dataProjectTime = "2006-01-02T15:04:05"

// Top returns the highest raw-resource sell price seen within maxAge, with up
// to `runners` further entries, highest first. Reuses BestRoute's cache.
func (c *Client) Top(runners int) (TopPrice, error) {
	entries, err := c.BestRoute()
	if err != nil {
		return TopPrice{}, err
	}
	return top(entries, time.Now().UTC(), runners), nil
}

func top(entries []Entry, now time.Time, runners int) TopPrice {
	result := TopPrice{Runners: []TopEntry{}}
	for _, e := range entries {
		seen, err := time.Parse(dataProjectTime, e.UpdatedAt)
		if err != nil || now.Sub(seen) > maxAge || seen.After(now.Add(time.Hour)) {
			result.Stale++
			continue
		}
		te := TopEntry{Entry: e, AgeMinutes: int(now.Sub(seen).Minutes())}
		if result.Best == nil {
			result.Best = &te
			continue
		}
		if len(result.Runners) < runners {
			result.Runners = append(result.Runners, te)
		}
	}
	return result
}
