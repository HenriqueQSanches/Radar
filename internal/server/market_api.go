package server

import (
	"net/http"

	"github.com/nospy/albion-openradar/internal/market"
)

// MarketAPI backs the radar page's "most expensive resource today" button.
type MarketAPI struct {
	client *market.Client
}

func NewMarketAPI(client *market.Client) *MarketAPI {
	return &MarketAPI{client: client}
}

func (a *MarketAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/market/top", a.handleTop)
}

// handleTop answers with the best fresh price plus the next four, so the
// radar page can show one headline and a short comparison list.
func (a *MarketAPI) handleTop(w http.ResponseWriter, _ *http.Request) {
	result, err := a.client.Top(4)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}
