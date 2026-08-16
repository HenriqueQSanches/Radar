package server

import (
	"net/http"

	"github.com/nospy/albion-openradar/internal/market"
)

// MarketAPI exposes the market-route price list backing the radar page's route button.
type MarketAPI struct {
	client *market.Client
}

func NewMarketAPI(client *market.Client) *MarketAPI {
	return &MarketAPI{client: client}
}

func (a *MarketAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/market/route", a.handleRoute)
	mux.HandleFunc("GET /api/market/fish", a.handleFish)
}

func (a *MarketAPI) handleRoute(w http.ResponseWriter, _ *http.Request) {
	entries, err := a.client.BestRoute()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (a *MarketAPI) handleFish(w http.ResponseWriter, _ *http.Request) {
	entries, err := a.client.FishPrices()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}
