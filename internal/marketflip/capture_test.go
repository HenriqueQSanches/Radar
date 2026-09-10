package marketflip

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/nospy/albion-openradar/internal/photon"
	"github.com/nospy/albion-openradar/internal/photon/operationcodes"
)

func newTestCapture(t *testing.T) (*Capture, *Store) {
	t.Helper()
	zones, err := LoadZoneIndex(testZoneFS())
	require.NoError(t, err)
	store, err := NewStore(t.TempDir())
	require.NoError(t, err)
	return NewCapture(zones, nil, store), store
}

func newTestCaptureWithItems(t *testing.T) (*Capture, *Store) {
	t.Helper()
	zones, err := LoadZoneIndex(testZoneFS())
	require.NoError(t, err)
	items, err := LoadItemIndex(testItemFS())
	require.NoError(t, err)
	store, err := NewStore(t.TempDir())
	require.NoError(t, err)
	return NewCapture(zones, items, store), store
}

func TestCapture_HandleResponse_AuctionGetOffers(t *testing.T) {
	mc, store := newTestCapture(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetOffers,
		Parameters: map[byte]interface{}{
			0: []string{
				`{"Id":1,"ItemTypeId":"T4_BAG","LocationId":1000,"QualityLevel":1,"UnitPriceSilver":15000,"Amount":3,"AuctionType":"offer"}`,
			},
		},
	}

	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "T4_BAG", all[0].ItemID)
	require.Equal(t, "Lymhurst", all[0].City, "resolved from LocationId via zones.json")
}

func TestCapture_HandleResponse_DividesWireSilverScale(t *testing.T) {
	mc, store := newTestCapture(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetOffers,
		Parameters: map[byte]interface{}{
			0: []string{
				`{"Id":1,"ItemTypeId":"T2_FIBER","LocationId":1000,"UnitPriceSilver":360000,"Amount":999,"AuctionType":"offer"}`,
			},
		},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, int64(36), all[0].UnitPriceSilver,
		"wire silver arrives x10000 (Albion convention); 360000 on the wire is 36 real silver")
}

// @verified 2026-09-09: real market orders never carry a usable per-order
// LocationId (only ever validated against protocol docs/synthetic fixtures
// before — live capture showed every order landing with City ""). The real
// city comes from tracking JoinFinished/ChangeCluster responses, which do
// carry the player's current map.
func TestCapture_HandleResponse_TracksCityFromChangeCluster(t *testing.T) {
	mc, store := newTestCapture(t)

	changeCluster := &photon.OperationResponse{
		OperationCode: operationcodes.ChangeCluster,
		Parameters:    map[byte]interface{}{0: "1000"},
	}
	photon.PostProcessResponse(changeCluster)
	require.NoError(t, mc.HandleResponse(changeCluster))

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetOffers,
		Parameters: map[byte]interface{}{
			0: []string{`{"Id":1,"ItemTypeId":"T4_BAG","UnitPriceSilver":10000,"Amount":1,"AuctionType":"offer"}`},
		},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "Lymhurst", all[0].City, "resolved from the tracked ChangeCluster map, not a per-order LocationId")
}

func TestCapture_HandleResponse_TracksCityFromJoinFinished(t *testing.T) {
	mc, store := newTestCapture(t)

	// Compound mapId ("1000-3", e.g. an instanced sub-area) — only the base
	// id before the "-" should resolve, same convention as the frontend's
	// ZonesDatabase.getZone.
	join := &photon.OperationResponse{
		OperationCode: operationcodes.Join,
		Parameters:    map[byte]interface{}{8: "1000-3", 9: []float32{0, 0}},
	}
	photon.PostProcessResponse(join)
	require.NoError(t, mc.HandleResponse(join))

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetRequests,
		Parameters: map[byte]interface{}{
			0: []string{`{"Id":1,"ItemTypeId":"T4_BAG","UnitPriceSilver":10000,"Amount":1,"AuctionType":"request"}`},
		},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "Lymhurst", all[0].City)
}

func TestCapture_HandleResponse_ClassifiesEquipmentViaItemIndex(t *testing.T) {
	mc, store := newTestCaptureWithItems(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetOffers,
		Parameters: map[byte]interface{}{
			0: []string{
				`{"Id":1,"ItemTypeId":"T4_MAIN_SWORD","LocationId":1000,"UnitPriceSilver":10000,"Amount":1,"AuctionType":"offer"}`,
			},
		},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "equipment", all[0].Category)
	require.Equal(t, "weapons", all[0].Subcategory)
}

func TestCapture_HandleResponse_ClassifiesFactionGearAsBlackMarket(t *testing.T) {
	mc, store := newTestCaptureWithItems(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetOffers,
		Parameters: map[byte]interface{}{
			0: []string{
				`{"Id":1,"ItemTypeId":"T4_OFF_TOWERSHIELD_UNDEAD","LocationId":1000,"UnitPriceSilver":10000,"Amount":1,"AuctionType":"offer"}`,
			},
		},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "blackmarket", all[0].Category)
}

func TestCapture_HandleResponse_TagsCategory(t *testing.T) {
	mc, store := newTestCapture(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetOffers,
		Parameters: map[byte]interface{}{
			0: []string{
				`{"Id":1,"ItemTypeId":"T4_ORE","LocationId":1000,"QualityLevel":1,"UnitPriceSilver":100,"Amount":1,"AuctionType":"offer"}`,
			},
		},
	}

	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "resources", all[0].Category)
	require.Equal(t, "Minério", all[0].Subcategory)
}

func TestCapture_HandleResponse_UnrelatedOperation(t *testing.T) {
	mc, store := newTestCapture(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.Join,
		Parameters:    map[byte]interface{}{0: []string{`{"ItemTypeId":"T4_BAG"}`}},
	}

	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))
	require.Empty(t, store.All())
}

func TestCapture_HandleResponse_NilOrWrongParamType(t *testing.T) {
	mc, store := newTestCapture(t)

	require.NoError(t, mc.HandleResponse(nil))

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetRequests,
		Parameters:    map[byte]interface{}{0: "not a []string"},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))
	require.Empty(t, store.All())
}

func TestCapture_HandleResponse_UnknownZoneStillStored(t *testing.T) {
	mc, store := newTestCapture(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.AuctionGetRequests,
		Parameters: map[byte]interface{}{
			0: []string{`{"ItemTypeId":"T4_BAG","LocationId":999999,"UnitPriceSilver":1,"AuctionType":"request"}`},
		},
	}
	photon.PostProcessResponse(resp)
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Empty(t, all[0].City)
}
