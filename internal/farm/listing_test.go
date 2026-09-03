package farm

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestList_TagsKindAndSortsByTier(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var rows []priceRow
		for _, c := range append(append([]Crop{}, Crops...), Herbs...) {
			rows = append(rows, priceRow{ItemID: c.SeedItemID, SellPriceMin: 100})
			rows = append(rows, priceRow{ItemID: c.HarvestItemID, SellPriceMin: 200})
		}
		_ = json.NewEncoder(w).Encode(rows)
	}))
	defer server.Close()
	client := &PriceClient{httpClient: server.Client(), baseURL: server.URL}

	list, err := List(client)
	require.NoError(t, err)
	require.Len(t, list, len(Crops)+len(Herbs))

	require.Equal(t, "crop", list[0].Kind)
	require.Equal(t, 1, list[0].Tier, "crops start at T1")
	require.Equal(t, int64(100), list[0].SeedPrice)
	require.Equal(t, int64(200), list[0].HarvestPrice)
	require.Equal(t, GrowthHours, list[0].GrowthHours)

	lastCrop := list[len(Crops)-1]
	firstHerb := list[len(Crops)]
	require.Equal(t, "crop", lastCrop.Kind)
	require.Equal(t, "herb", firstHerb.Kind)
	require.Equal(t, 2, firstHerb.Tier, "herbs start at T2")
}

func TestList_MissingPriceComesBackZero(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]priceRow{})
	}))
	defer server.Close()
	client := &PriceClient{httpClient: server.Client(), baseURL: server.URL}

	list, err := List(client)
	require.NoError(t, err)
	require.Len(t, list, len(Crops)+len(Herbs))
	for _, c := range list {
		require.Zero(t, c.SeedPrice)
		require.Zero(t, c.HarvestPrice)
	}
}
