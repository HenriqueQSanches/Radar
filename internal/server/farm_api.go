package server

import (
	"net/http"

	"github.com/nospy/albion-openradar/internal/farm"
)

// FarmAPI exposes crop/herb seed and harvest prices backing the farming
// profit calculator. The profit math itself runs client side (the user
// tunes lots, yield, premium and price overrides live) — this endpoint
// just supplies a starting price per item.
type FarmAPI struct {
	client *farm.PriceClient
}

func NewFarmAPI(client *farm.PriceClient) *FarmAPI {
	return &FarmAPI{client: client}
}

func (a *FarmAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/farm/crops", a.handleCrops)
}

func (a *FarmAPI) handleCrops(w http.ResponseWriter, _ *http.Request) {
	crops, err := farm.List(a.client)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, crops)
}
