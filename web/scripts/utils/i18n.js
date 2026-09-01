import settingsSync from "./SettingsSync.js";
import {CATEGORIES} from "../constants/LoggerConstants.js";

const LANG_KEY = "settingLanguage";
const DEFAULT_LANG = "en";

// Radar's native language is English; this dictionary is intentionally scoped to the
// highest-traffic surfaces (navigation, the radar page, the market page) rather than
// every checkbox label across every settings page — those follow incrementally.
const translations = {
    en: {
        "nav.radar": "Radar",
        "nav.players": "Players",
        "nav.resources": "Resources",
        "nav.enemies": "Enemies",
        "nav.chests": "Chests",
        "nav.market": "Market",
        "nav.ignorelist": "Ignore List",
        "nav.settings": "Settings",

        "header.connected": "Connected",
        "header.disconnected": "Disconnected",
        "header.connecting": "Connecting...",

        "radar.display.label": "Display:",
        "radar.display.count": "Count",
        "radar.display.distance": "Distance",
        "radar.display.clusters": "Clusters",
        "radar.zoom.label": "Zoom:",
        "radar.zoom.reset": "Reset",
        "radar.size.label": "Size:",
        "radar.size.reset": "Reset",
        "radar.icons.label": "Icons:",
        "radar.icons.reset": "Reset",
        "radar.players.title": "Detected Players",
        "radar.players.show": "Show",
        "radar.players.hostile": "Hostiles",
        "radar.players.faction": "Faction",
        "radar.players.passive": "Passive",
        "radar.players.empty": "No players detected yet",
        "radar.players.scanning": "Scanning...",

        "market.title": "Market",
        "market.subtitle": "Sell prices in Thetford, Fort Sterling, Lymhurst, Bridgewatch, Martlock and Caerleon, via the Albion Online Data Project.",
        "market.route.title": "Market Route",
        "market.route.calcBtn": "Calculate Route",
        "market.route.citiesBtn": "Best City",
        "market.route.description": "Sell price of raw resources (T2-T8, including T4.1-T8.1). \"Best City\" uses the same data, grouped by overall city average.",
        "market.route.resourceLabel": "Resource:",
        "market.route.tierLabel": "Tier:",
        "market.route.all": "All",
        "market.resource.wood": "Wood",
        "market.resource.stone": "Stone",
        "market.resource.fiber": "Fiber",
        "market.resource.hide": "Hide",
        "market.resource.ore": "Ore",
        "market.fish.title": "Fish",
        "market.fish.calcBtn": "Search Fish",
        "market.fish.description": "Sell price of fish (T4-T8).",
        "market.fish.label": "Fish:",
        "market.fish.freshwater": "Freshwater",
        "market.fish.freshwaterRare": "Freshwater Rare",
        "market.fish.saltwater": "Saltwater",
        "market.fish.saltwaterRare": "Saltwater Rare",
        "market.table.resource": "Resource",
        "market.table.price": "Price",
        "market.table.city": "City",
        "market.table.cityAvgPrice": "Average price",
        "market.table.samples": "Samples",
        "market.status.searchingPrices": "Searching prices...",
        "market.status.searchingCities": "Calculating city average...",
        "market.status.noResultsForFilter": "No results for this filter.",
        "market.status.noPricesAvailable": "No prices available right now.",
        "market.status.fetchError": "Error fetching prices. Try again shortly.",
        "market.dev.badge": "In development",
        "market.dev.text": "More resources, regions and price comparisons are on their way to this tab.",

        "settings.title": "Settings",
        "settings.subtitle": "Configure radar display and debug options.",
        "settings.modal.resetTitle": "Reset All Settings",
        "settings.modal.resetBody": "This will reset all settings to their default values and reload the page. This action cannot be undone.",
        "settings.modal.cancel": "Cancel",
        "settings.modal.resetConfirm": "Reset Settings",
        "settings.modal.clearCacheTitle": "Clear Browser Cache",
        "settings.modal.clearCacheBody": "This will clear the browser cache for this site. Cached images and data will need to be reloaded.",
        "settings.modal.clearCacheConfirm": "Clear Cache",
        "settings.display.title": "Display",
        "settings.display.mapBackground": "Map Background",
        "settings.display.mapBackgroundTip": "Display the Albion Online map as background on the radar.",
        "settings.display.resourceCount": "Resource Count",
        "settings.display.resourceCountTip": "Shows total quantity including gathering bonuses.",
        "settings.display.distanceIndicator": "Distance Indicator",
        "settings.display.distanceIndicatorTip": "Color-coded: Green (<20m), Yellow (20-40m), Red (>40m).",
        "settings.display.colorBadges": "Resource Color Badges",
        "settings.display.colorBadgesTip": "Replace resource icons with colored tier badges (better visibility). Living variants get a gold border.",
        "settings.display.clusters": "Resource Clusters",
        "settings.display.clustersTip": "Groups nearby resources for efficient harvesting routes.",
        "settings.display.radius": "Radius",
        "settings.display.minSize": "Min size",
        "settings.logging.title": "Logging",
        "settings.logging.logLevel": "Log Level",
        "settings.logging.logLevelDesc": "Controls minimum log level displayed",
        "settings.logging.level.off": "OFF - No logs",
        "settings.logging.level.error": "ERROR - Errors only",
        "settings.logging.level.warn": "WARN - Warnings & Errors",
        "settings.logging.level.info": "INFO - Info, Warnings & Errors",
        "settings.logging.level.debug": "DEBUG - Everything",
        "settings.logging.output": "Output",
        "settings.logging.browserConsole": "Browser Console (F12)",
        "settings.logging.browserConsoleTip": "Print logs in the browser DevTools console.",
        "settings.logging.serverLogs": "Server Logs (JSONL)",
        "settings.logging.serverLogsTip": "Send frontend logs to the backend (saved to logs/debug/; errors go to logs/errors/ too).",
        "settings.logging.categoryFilters": "Category Filters",
        "settings.logging.categoryFiltersNote": "(applies to DEBUG & INFO only)",
        "settings.logging.category.system": "System",
        "settings.logging.category.network": "Network",
        "settings.logging.category.map": "Map",
        "settings.logging.category.players": "Players",
        "settings.logging.category.mobs": "Mobs",
        "settings.logging.category.harvestables": "Harvestables",
        "settings.logging.category.dungeons": "Dungeons",
        "settings.logging.category.fishing": "Fishing",
        "settings.logging.category.rendering": "Rendering",
        "settings.debug.title": "Debug",
        "settings.debug.advanced": "Advanced",
        "settings.debug.saveBackendLogs": "Save Backend Logs",
        "settings.debug.saveBackendLogsTip": "Save backend (Go) logs to logs/sessions/. Errors are always saved to logs/errors/.",
        "settings.debug.recordPcap": "Record Network Capture (pcap)",
        "settings.debug.recordPcapTip": "Record the raw network capture to logs/captures/. Useful for debugging without running tcpdump externally.",
        "settings.debug.wsPerf": "WebSocket Performance",
        "settings.debug.eventCoalescing": "Event Coalescing",
        "settings.debug.eventCoalescingTip": "Groups Move/Health events per entity per frame.",
        "settings.debug.healthThrottling": "Health Throttling",
        "settings.debug.healthThrottlingTip": "Limits health updates to 20/sec per entity.",
        "settings.debug.exportBtn": "Export Debug Data",
        "settings.debug.exportDesc": "Download settings and session info as JSON",
        "settings.network.title": "Network",
        "settings.network.loading": "Loading network configuration…",
        "settings.danger.title": "Danger Zone",
        "settings.danger.resetBtn": "Reset All Settings",
        "settings.danger.clearCacheBtn": "Clear Cache",
        "settings.toast.resetSuccess": "Settings reset successfully",
        "settings.toast.cacheCleared": "Cache cleared",
    },
    pt: {
        "nav.radar": "Radar",
        "nav.players": "Jogadores",
        "nav.resources": "Recursos",
        "nav.enemies": "Inimigos",
        "nav.chests": "Baús",
        "nav.market": "Mercado",
        "nav.ignorelist": "Lista de Ignorados",
        "nav.settings": "Configurações",

        "header.connected": "Conectado",
        "header.disconnected": "Desconectado",
        "header.connecting": "Conectando...",

        "radar.display.label": "Exibir:",
        "radar.display.count": "Quantidade",
        "radar.display.distance": "Distância",
        "radar.display.clusters": "Agrupamentos",
        "radar.zoom.label": "Zoom:",
        "radar.zoom.reset": "Redefinir",
        "radar.size.label": "Tamanho:",
        "radar.size.reset": "Redefinir",
        "radar.icons.label": "Ícones:",
        "radar.icons.reset": "Redefinir",
        "radar.players.title": "Jogadores Detectados",
        "radar.players.show": "Exibir",
        "radar.players.hostile": "Hostis",
        "radar.players.faction": "Facção",
        "radar.players.passive": "Passivos",
        "radar.players.empty": "Nenhum jogador detectado ainda",
        "radar.players.scanning": "Escaneando...",

        "market.title": "Mercado",
        "market.subtitle": "Preços de venda em Thetford, Fort Sterling, Lymhurst, Bridgewatch, Martlock e Caerleon, via Albion Online Data Project.",
        "market.route.title": "Rota de Mercado",
        "market.route.calcBtn": "Calcular Rota",
        "market.route.citiesBtn": "Melhor Cidade",
        "market.route.description": "Preço de venda de recursos brutos (T2-T8, incluindo T4.1-T8.1). \"Melhor Cidade\" usa a mesma busca, mas agrupa pela média geral por cidade.",
        "market.route.resourceLabel": "Recurso:",
        "market.route.tierLabel": "Tier:",
        "market.route.all": "Todos",
        "market.resource.wood": "Madeira",
        "market.resource.stone": "Pedra",
        "market.resource.fiber": "Fibra",
        "market.resource.hide": "Couro",
        "market.resource.ore": "Minério",
        "market.fish.title": "Peixe",
        "market.fish.calcBtn": "Buscar Peixe",
        "market.fish.description": "Preço de venda de peixe (T4-T8).",
        "market.fish.label": "Peixe:",
        "market.fish.freshwater": "Água Doce",
        "market.fish.freshwaterRare": "Água Doce Raro",
        "market.fish.saltwater": "Água Salgada",
        "market.fish.saltwaterRare": "Água Salgada Raro",
        "market.table.resource": "Recurso",
        "market.table.price": "Preço",
        "market.table.city": "Cidade",
        "market.table.cityAvgPrice": "Preço médio",
        "market.table.samples": "Amostras",
        "market.status.searchingPrices": "Buscando preços...",
        "market.status.searchingCities": "Calculando média por cidade...",
        "market.status.noResultsForFilter": "Nenhum resultado com esse filtro.",
        "market.status.noPricesAvailable": "Nenhum preço disponível agora.",
        "market.status.fetchError": "Erro ao buscar preços. Tente novamente em instantes.",
        "market.dev.badge": "Em desenvolvimento",
        "market.dev.text": "Mais recursos, regiões e comparações de preço estão a caminho para esta aba.",

        "settings.title": "Configurações",
        "settings.subtitle": "Configure as opções de exibição e depuração do radar.",
        "settings.modal.resetTitle": "Redefinir Todas as Configurações",
        "settings.modal.resetBody": "Isso vai redefinir todas as configurações para os valores padrão e recarregar a página. Essa ação não pode ser desfeita.",
        "settings.modal.cancel": "Cancelar",
        "settings.modal.resetConfirm": "Redefinir Configurações",
        "settings.modal.clearCacheTitle": "Limpar Cache do Navegador",
        "settings.modal.clearCacheBody": "Isso vai limpar o cache do navegador para este site. Imagens e dados em cache precisarão ser recarregados.",
        "settings.modal.clearCacheConfirm": "Limpar Cache",
        "settings.display.title": "Exibição",
        "settings.display.mapBackground": "Mapa de Fundo",
        "settings.display.mapBackgroundTip": "Exibe o mapa do Albion Online como fundo no radar.",
        "settings.display.resourceCount": "Quantidade de Recursos",
        "settings.display.resourceCountTip": "Mostra a quantidade total incluindo bônus de coleta.",
        "settings.display.distanceIndicator": "Indicador de Distância",
        "settings.display.distanceIndicatorTip": "Codificado por cor: Verde (<20m), Amarelo (20-40m), Vermelho (>40m).",
        "settings.display.colorBadges": "Selos Coloridos de Recurso",
        "settings.display.colorBadgesTip": "Substitui os ícones de recurso por selos coloridos por tier (melhor visibilidade). Variantes vivas ganham borda dourada.",
        "settings.display.clusters": "Agrupamentos de Recursos",
        "settings.display.clustersTip": "Agrupa recursos próximos para rotas de coleta eficientes.",
        "settings.display.radius": "Raio",
        "settings.display.minSize": "Tamanho mín.",
        "settings.logging.title": "Registro de Logs",
        "settings.logging.logLevel": "Nível de Log",
        "settings.logging.logLevelDesc": "Controla o nível mínimo de log exibido",
        "settings.logging.level.off": "OFF - Sem logs",
        "settings.logging.level.error": "ERROR - Somente erros",
        "settings.logging.level.warn": "WARN - Avisos e Erros",
        "settings.logging.level.info": "INFO - Info, Avisos e Erros",
        "settings.logging.level.debug": "DEBUG - Tudo",
        "settings.logging.output": "Saída",
        "settings.logging.browserConsole": "Console do Navegador (F12)",
        "settings.logging.browserConsoleTip": "Exibe os logs no console de DevTools do navegador.",
        "settings.logging.serverLogs": "Logs do Servidor (JSONL)",
        "settings.logging.serverLogsTip": "Envia os logs do frontend para o backend (salvos em logs/debug/; erros também vão para logs/errors/).",
        "settings.logging.categoryFilters": "Filtros de Categoria",
        "settings.logging.categoryFiltersNote": "(aplica-se somente a DEBUG e INFO)",
        "settings.logging.category.system": "Sistema",
        "settings.logging.category.network": "Rede",
        "settings.logging.category.map": "Mapa",
        "settings.logging.category.players": "Jogadores",
        "settings.logging.category.mobs": "Mobs",
        "settings.logging.category.harvestables": "Coletáveis",
        "settings.logging.category.dungeons": "Dungeons",
        "settings.logging.category.fishing": "Pesca",
        "settings.logging.category.rendering": "Renderização",
        "settings.debug.title": "Depuração",
        "settings.debug.advanced": "Avançado",
        "settings.debug.saveBackendLogs": "Salvar Logs do Backend",
        "settings.debug.saveBackendLogsTip": "Salva os logs do backend (Go) em logs/sessions/. Erros são sempre salvos em logs/errors/.",
        "settings.debug.recordPcap": "Gravar Captura de Rede (pcap)",
        "settings.debug.recordPcapTip": "Grava a captura de rede bruta em logs/captures/. Útil para depurar sem rodar tcpdump externamente.",
        "settings.debug.wsPerf": "Desempenho do WebSocket",
        "settings.debug.eventCoalescing": "Agrupamento de Eventos",
        "settings.debug.eventCoalescingTip": "Agrupa eventos de Movimento/Vida por entidade a cada quadro.",
        "settings.debug.healthThrottling": "Limitação de Vida",
        "settings.debug.healthThrottlingTip": "Limita atualizações de vida a 20/seg por entidade.",
        "settings.debug.exportBtn": "Exportar Dados de Depuração",
        "settings.debug.exportDesc": "Baixa configurações e informações da sessão em JSON",
        "settings.network.title": "Rede",
        "settings.network.loading": "Carregando configuração de rede…",
        "settings.danger.title": "Zona de Perigo",
        "settings.danger.resetBtn": "Redefinir Todas as Configurações",
        "settings.danger.clearCacheBtn": "Limpar Cache",
        "settings.toast.resetSuccess": "Configurações redefinidas com sucesso",
        "settings.toast.cacheCleared": "Cache limpo",
    },
};

function getLanguage() {
    const saved = settingsSync.get(LANG_KEY, null);
    return translations[saved] ? saved : DEFAULT_LANG;
}

function t(key) {
    const lang = getLanguage();
    return translations[lang]?.[key] ?? translations[DEFAULT_LANG]?.[key] ?? key;
}

function applyTranslations(root = document) {
    const lang = getLanguage();

    root.querySelectorAll?.('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll?.('[data-i18n-placeholder]').forEach(el => {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll?.('[data-i18n-title]').forEach(el => {
        el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    // DaisyUI tooltips render from data-tip, not the title attribute.
    root.querySelectorAll?.('[data-i18n-tip]').forEach(el => {
        el.setAttribute('data-tip', t(el.getAttribute('data-i18n-tip')));
    });

    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('btn-primary', btn.dataset.lang === lang);
        btn.classList.toggle('btn-ghost', btn.dataset.lang !== lang);
    });
}

function setLanguage(lang) {
    if (!translations[lang]) return;
    settingsSync.set(LANG_KEY, lang);
    applyTranslations();
    window.logger?.debug(CATEGORIES.SYSTEM, 'LanguageChanged', {lang});
    document.dispatchEvent(new CustomEvent('languageChanged', {detail: {lang}}));
}

const i18n = {getLanguage, setLanguage, t, applyTranslations};
export default i18n;
