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
	body := `[{"item_id":"T1_WOOD","city":"Thetford","sell_price_min":10}]`

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(body))
	})

	entries, err := client.BestRoute()
	if err != nil {
		t.Fatalf("BestRoute returned error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected T1 (below scope) to be ignored, got %+v", entries)
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

func TestBuildItems_CoversT2ThroughT8AndOnlyT4PlusGetEnchantedVariant(t *testing.T) {
	ids, meta := buildItems()

	if _, ok := meta["T2_WOOD@1"]; ok {
		t.Error("T2 is below T4 and should not have an enchanted variant")
	}
	if _, ok := meta["T3_WOOD@1"]; ok {
		t.Error("T3 is below T4 and should not have an enchanted variant")
	}
	if m, ok := meta["T2_WOOD"]; !ok || m.tier != 2 || m.enchant != 0 {
		t.Errorf("expected T2_WOOD to map to tier 2 enchant 0, got %+v (ok=%v)", m, ok)
	}
	if m, ok := meta["T4_ORE@1"]; !ok || m.tier != 4 || m.enchant != 1 {
		t.Errorf("expected T4_ORE@1 to map to tier 4 enchant 1, got %+v (ok=%v)", m, ok)
	}
	if m, ok := meta["T8_ROCK@1"]; !ok || m.tier != 8 || m.enchant != 1 {
		t.Errorf("expected T8_ROCK@1 to map to tier 8 enchant 1, got %+v (ok=%v)", m, ok)
	}
	// 5 resources * (7 base tiers T2-T8 + 5 enchanted tiers T4-T8) = 60
	if len(ids) != 60 {
		t.Errorf("expected 60 item ids, got %d", len(ids))
	}
}

func TestTop_PicksFreshestHighestAndCountsStale(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	entries := []Entry{
		{Resource: "Minério", Tier: 8, Enchant: 1, City: "Caerleon", Price: 9000, UpdatedAt: "2026-10-20T12:00:00"}, // a week old
		{Resource: "Madeira", Tier: 7, Enchant: 0, City: "Lymhurst", Price: 5000, UpdatedAt: "2026-10-27T10:30:00"},
		{Resource: "Fibra", Tier: 6, Enchant: 1, City: "Martlock", Price: 4000, UpdatedAt: "2026-10-27T11:59:00"},
		{Resource: "Pedra", Tier: 5, Enchant: 0, City: "Thetford", Price: 300, UpdatedAt: "0001-01-01T00:00:00"},
		{Resource: "Couro", Tier: 4, Enchant: 0, City: "Bridgewatch", Price: 200, UpdatedAt: "not-a-date"},
	}

	got := top(entries, now, 1)

	if got.Best == nil || got.Best.Resource != "Madeira" || got.Best.City != "Lymhurst" {
		t.Fatalf("best = %+v, want Madeira at Lymhurst", got.Best)
	}
	if got.Best.AgeMinutes != 90 {
		t.Errorf("best age = %d minutes, want 90", got.Best.AgeMinutes)
	}
	if len(got.Runners) != 1 || got.Runners[0].Resource != "Fibra" {
		t.Errorf("runners = %+v, want one Fibra entry", got.Runners)
	}
	if got.Stale != 3 {
		t.Errorf("stale = %d, want 3", got.Stale)
	}
}

func TestTop_NoFreshEntriesLeavesBestNil(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	got := top([]Entry{{Price: 1, UpdatedAt: "2026-01-01T00:00:00"}}, now, 3)
	if got.Best != nil || len(got.Runners) != 0 || got.Stale != 1 {
		t.Fatalf("got %+v, want no best, no runners, 1 stale", got)
	}
}
