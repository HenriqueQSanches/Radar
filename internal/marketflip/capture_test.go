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
	return NewCapture(zones, store), store
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

	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "T4_BAG", all[0].ItemID)
	require.Equal(t, "Lymhurst", all[0].City, "resolved from LocationId via zones.json")
}

func TestCapture_HandleResponse_UnrelatedOperation(t *testing.T) {
	mc, store := newTestCapture(t)

	resp := &photon.OperationResponse{
		OperationCode: operationcodes.Join,
		Parameters:    map[byte]interface{}{0: []string{`{"ItemTypeId":"T4_BAG"}`}},
	}

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
	require.NoError(t, mc.HandleResponse(resp))

	all := store.All()
	require.Len(t, all, 1)
	require.Equal(t, "", all[0].City)
}
