package marketflip

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestStore_PutAllAndAll(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	older := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100, CapturedAt: time.Now().Add(-time.Hour)}
	newer := Order{ItemID: "T5_BAG", City: "Martlock", AuctionType: "request", UnitPriceSilver: 200, CapturedAt: time.Now()}

	require.NoError(t, store.PutAll([]Order{older, newer}))

	all := store.All()
	require.Len(t, all, 2)
	require.Equal(t, "T5_BAG", all[0].ItemID, "newest capture first")
}

// @verified 2026-09-01: previously the dedup key was item+quality+enchant+city+side
// only, so two different sellers' listings for the same item/city/side collapsed
// into one — whichever was processed last in the batch silently discarded the
// rest, including possibly the cheapest one Opportunities() needs to find.
// AuctionID (the game's own unique listing id) must keep them distinct.
func TestStore_PutAll_KeepsDistinctListingsWithSameItemCityAndSide(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	seller1 := Order{AuctionID: 1, ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 1000, CapturedAt: time.Now()}
	seller2 := Order{AuctionID: 2, ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 800, CapturedAt: time.Now()}
	require.NoError(t, store.PutAll([]Order{seller1, seller2}))

	all := store.All()
	require.Len(t, all, 2, "both listings should survive, not collapse into one")

	prices := []int64{all[0].UnitPriceSilver, all[1].UnitPriceSilver}
	require.ElementsMatch(t, []int64{1000, 800}, prices)
}

func TestStore_PutAll_OverwritesSameKey(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	first := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100, CapturedAt: time.Now()}
	require.NoError(t, store.PutAll([]Order{first}))

	second := first
	second.UnitPriceSilver = 150
	second.CapturedAt = time.Now().Add(time.Minute)
	require.NoError(t, store.PutAll([]Order{second}))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, int64(150), all[0].UnitPriceSilver)
}

func TestStore_PersistsAcrossReload(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	order := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", UnitPriceSilver: 100, CapturedAt: time.Now()}
	require.NoError(t, store.PutAll([]Order{order}))

	reopened, err := NewStore(dir)
	require.NoError(t, err)
	all := reopened.All()
	require.Len(t, all, 1)
	require.Equal(t, "T4_BAG", all[0].ItemID)
}

func TestStore_Clear(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	require.NoError(t, store.PutAll([]Order{{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now()}}))
	require.Len(t, store.All(), 1)

	require.NoError(t, store.Clear())
	require.Empty(t, store.All())

	reopened, err := NewStore(dir)
	require.NoError(t, err)
	require.Empty(t, reopened.All())
}

func TestStore_PutAll_Empty(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	require.NoError(t, store.PutAll(nil))
	require.Empty(t, store.All())
}

func TestStore_All_DropsStaleOrders(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	stale := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now().Add(-StaleAfter - time.Minute)}
	fresh := Order{ItemID: "T5_BAG", City: "Martlock", AuctionType: "request", CapturedAt: time.Now()}
	require.NoError(t, store.PutAll([]Order{stale, fresh}))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "T5_BAG", all[0].ItemID)
}

func TestStore_All_DropStalePersistsAcrossReload(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	stale := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now().Add(-StaleAfter - time.Minute)}
	require.NoError(t, store.PutAll([]Order{stale}))
	require.Empty(t, store.All(), "All() purges and persists the drop")

	reopened, err := NewStore(dir)
	require.NoError(t, err)
	require.Empty(t, reopened.All(), "the purge from All() should have been written to disk")
}

func TestStore_PutAll_DropsStaleBeforeInserting(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	stale := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now().Add(-StaleAfter - time.Minute)}
	require.NoError(t, store.PutAll([]Order{stale}))

	fresh := Order{ItemID: "T5_BAG", City: "Martlock", AuctionType: "request", CapturedAt: time.Now()}
	require.NoError(t, store.PutAll([]Order{fresh}))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "T5_BAG", all[0].ItemID)
}

// @verified 2026-09-01: a corrupted local market_flip.json used to make NewStore
// fail outright, which the caller (cmd/radar) treated as fatal — one bad cache
// file for an unrelated feature took down the entire radar. NewStore must always
// return a usable, empty store even when the on-disk file can't be parsed.
func TestStore_NewStore_UsableAfterCorruptedFile(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "market_flip.json"), []byte("{not valid json"), 0o644))

	store, err := NewStore(dir)
	require.Error(t, err, "the caller should still learn the file was bad, just not treat it as fatal")
	require.NotNil(t, store)
	require.Empty(t, store.All())

	// And it should self-heal: a normal capture works and persists from here on.
	require.NoError(t, store.PutAll([]Order{{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now()}}))
	require.Len(t, store.All(), 1)
}

// @verified 2026-09-01: capture runs one goroutine per active network interface
// (internal/capture.Manager), so concurrent PutAll calls are a real scenario, not
// a hypothetical — run with `go test -race` to catch the write-tmp-file collision
// this used to allow when the lock was released before the disk write.
func TestStore_PutAll_ConcurrentCallsDontRace(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(dir)
	require.NoError(t, err)

	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_ = store.PutAll([]Order{{
				AuctionID:   n,
				ItemID:      "T4_BAG",
				City:        "Lymhurst",
				AuctionType: "offer",
				CapturedAt:  time.Now(),
			}})
		}(i)
	}
	wg.Wait()

	require.Len(t, store.All(), 20)

	reopened, err := NewStore(dir)
	require.NoError(t, err, "the persisted file must still be valid JSON after concurrent writes")
	require.Len(t, reopened.All(), 20)
}

func TestStore_NewStore_PurgesStaleOnLoad(t *testing.T) {
	dir := t.TempDir()
	seed, err := NewStore(dir)
	require.NoError(t, err)
	stale := Order{ItemID: "T4_BAG", City: "Lymhurst", AuctionType: "offer", CapturedAt: time.Now().Add(-StaleAfter - time.Minute)}
	require.NoError(t, seed.PutAll([]Order{stale}))
	// PutAll purges pre-existing stale entries before inserting, but the one
	// just inserted here is already stale at insertion time, so it lands on
	// disk stale — simulating the app being reopened after a long break.

	reopened, err := NewStore(dir)
	require.NoError(t, err)
	require.Empty(t, reopened.All(), "NewStore should purge stale entries loaded from disk")
}
