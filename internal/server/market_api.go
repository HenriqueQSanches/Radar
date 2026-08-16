package server

import (
	"net/http"

	"github.com/nospy/albion-openradar/internal/market"
)

// MarketAPI exposes the "Calcular Rota" price list.
type MarketAPI struct {
	client *market.Client
}

func NewMarketAPI(client *market.Client) *MarketAPI {
	return &MarketAPI{client: client}
}

func (a *MarketAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/market/route", a.handleRoute)
}

func (a *MarketAPI) handleRoute(w http.ResponseWriter, _ *http.Request) {
	entries, err := a.client.BestRoute()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}
