package marketflip

import (
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
