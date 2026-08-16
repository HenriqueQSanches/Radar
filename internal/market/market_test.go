package market

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &Client{
		region:     RegionAmericas,
		httpClient: server.Client(),
		baseURL:    server.URL,
	}
}

func TestBestRoute_FiltersZeroPricesAndSorts(t *testing.T) {
	body := `[
		{"item_id":"T5_ORE","city":"Thetford","sell_price_min":407,"sell_price_min_date":"2026-08-16T04:20:00"},
		{"item_id":"T4_FIBER","city":"Martlock","sell_price_min":900,"sell_price_min_date":"2026-08-16T04:20:00"},
		{"item_id":"T5_ORE@1","city":"Thetford","sell_price_min":0,"sell_price_min_date":"0001-01-01T00:00:00"},
		{"item_id":"T3_WOOD","city":"Caerleon","sell_price_min":58,"sell_price_min_date":"2026-08-16T04:20:00"}
	]`

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(body))
	})

	entries, err := client.BestRoute()
	if err != nil {
		t.Fatalf("BestRoute returned error: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries (zero-price row dropped), got %d: %+v", len(entries), entries)
	}
	if entries[0].Price != 900 || entries[0].Resource != "Fibra" {
		t.Errorf("expected highest price first (Fibra/900), got %+v", entries[0])
	}
	if entries[len(entries)-1].Price != 58 {
		t.Errorf("expected lowest price last (58), got %+v", entries[len(entries)-1])
	}
}

func TestBestRoute_UnknownItemIdIgnored(t *testing.T) {
	body := `[{"item_id":"T2_WOOD","city":"Thetford","sell_price_min":10}]`

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(body))
	})

	entries, err := client.BestRoute()
	if err != nil {
		t.Fatalf("BestRoute returned error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected T2 (below scope) to be ignored, got %+v", entries)
	}
}

func TestBestRoute_UsesCacheWithinTTL(t *testing.T) {
	calls := 0
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Write([]byte(`[{"item_id":"T5_ORE","city":"Thetford","sell_price_min":100}]`))
	})

	if _, err := client.BestRoute(); err != nil {
		t.Fatalf("first BestRoute returned error: %v", err)
	}
	if _, err := client.BestRoute(); err != nil {
		t.Fatalf("second BestRoute returned error: %v", err)
	}
	if calls != 1 {
		t.Errorf("expected the second call to be served from cache, got %d upstream requests", calls)
	}

	client.routeCached = time.Now().Add(-cacheTTL - time.Second)
	if _, err := client.BestRoute(); err != nil {
		t.Fatalf("third BestRoute returned error: %v", err)
	}
	if calls != 2 {
		t.Errorf("expected an expired cache to trigger a new upstream request, got %d", calls)
	}
}

func TestBestRoute_UpstreamErrorPropagates(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	if _, err := client.BestRoute(); err == nil {
		t.Error("expected an error when upstream returns non-200, got nil")
	}
}

func TestBuildItems_OnlyT4AndT5GetEnchantedVariant(t *testing.T) {
	ids, meta := buildItems()

	if _, ok := meta["T3_WOOD@1"]; ok {
		t.Error("T3 should not have an enchanted variant in scope")
	}
	if m, ok := meta["T4_ORE@1"]; !ok || m.tier != 4 || m.enchant != 1 {
		t.Errorf("expected T4_ORE@1 to map to tier 4 enchant 1, got %+v (ok=%v)", m, ok)
	}
	if m, ok := meta["T5_ROCK"]; !ok || m.tier != 5 || m.enchant != 0 {
		t.Errorf("expected T5_ROCK to map to tier 5 enchant 0, got %+v (ok=%v)", m, ok)
	}
	// 5 resources * (3 base tiers + 2 enchanted tiers) = 25
	if len(ids) != 25 {
		t.Errorf("expected 25 item ids, got %d", len(ids))
	}
}

func TestBuildFishItems_CoversAllFamiliesAndTiers(t *testing.T) {
	ids, meta := buildFishItems()

	if _, ok := meta["T3_FISH_FRESHWATER_ALL_COMMON"]; ok {
		t.Error("T3 is below fish scope (T4-T8) and should not be queried")
	}
	if m, ok := meta["T4_FISH_FRESHWATER_ALL_COMMON"]; !ok || m.tier != 4 {
		t.Errorf("expected T4_FISH_FRESHWATER_ALL_COMMON to map to tier 4, got %+v (ok=%v)", m, ok)
	}
	if m, ok := meta["T8_FISH_SALTWATER_ALL_RARE"]; !ok || m.tier != 8 {
		t.Errorf("expected T8_FISH_SALTWATER_ALL_RARE to map to tier 8, got %+v (ok=%v)", m, ok)
	}
	// 4 fish families * 5 tiers (4-8) = 20
	if len(ids) != 20 {
		t.Errorf("expected 20 fish item ids, got %d", len(ids))
	}
}

func TestFishPrices_FiltersZeroPricesAndSorts(t *testing.T) {
	body := `[
		{"item_id":"T5_FISH_FRESHWATER_ALL_COMMON","city":"Thetford","sell_price_min":100},
		{"item_id":"T8_FISH_SALTWATER_ALL_RARE","city":"Caerleon","sell_price_min":4998},
		{"item_id":"T4_FISH_FRESHWATER_ALL_COMMON","city":"Martlock","sell_price_min":0}
	]`

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(body))
	})

	entries, err := client.FishPrices()
	if err != nil {
		t.Fatalf("FishPrices returned error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries (zero-price row dropped), got %d: %+v", len(entries), entries)
	}
	if entries[0].Price != 4998 || entries[0].City != "Caerleon" {
		t.Errorf("expected highest price first (Caerleon/4998), got %+v", entries[0])
	}
}

func TestFishPrices_UsesSeparateCacheFromBestRoute(t *testing.T) {
	calls := 0
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Write([]byte(`[{"item_id":"T5_ORE","city":"Thetford","sell_price_min":100},{"item_id":"T5_FISH_FRESHWATER_ALL_COMMON","city":"Thetford","sell_price_min":100}]`))
	})

	if _, err := client.BestRoute(); err != nil {
		t.Fatalf("BestRoute returned error: %v", err)
	}
	if _, err := client.FishPrices(); err != nil {
		t.Fatalf("FishPrices returned error: %v", err)
	}
	if calls != 2 {
		t.Errorf("expected BestRoute and FishPrices to hit upstream independently, got %d calls", calls)
	}
}
