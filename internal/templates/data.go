package templates

// PageData contains all data passed to page templates
type PageData struct {
	// Page identification
	Page   string // Current page name (e.g., "players", "settings")
	Title  string // Page title for <title> tag
	Active string // Active nav item identifier

	// Application metadata
	Version string // Application version

	// Navigation items
	NavItems []NavItem

	// Page-specific data (use type assertions in templates)
	Data interface{}
}

// NavItem represents a navigation menu item
type NavItem struct {
	Path   string // URL path (e.g., "/players")
	Label  string // Display label (English fallback, replaced client-side by i18n)
	Key    string // i18n key suffix (nav.<Key>) used to translate Label client-side
	Icon   string // Lucide icon name (e.g., "users")
	Active bool   // Whether this item is currently active
}

// DefaultNavItems returns the default navigation items for OpenRadar
func DefaultNavItems() []NavItem {
	return []NavItem{
		{Path: "/", Label: "Radar", Key: "radar", Icon: "radar"},
		{Path: "/players", Label: "Players", Key: "players", Icon: "users"},
		{Path: "/resources", Label: "Resources", Key: "resources", Icon: "gem"},
		{Path: "/enemies", Label: "Enemies", Key: "enemies", Icon: "skull"},
		{Path: "/chests", Label: "Chests", Key: "chests", Icon: "archive"},
		{Path: "/market", Label: "Market", Key: "market", Icon: "coins"},
		{Path: "/farm", Label: "Farm", Key: "farm", Icon: "sprout"},
		{Path: "/ignorelist", Label: "Ignore List", Key: "ignorelist", Icon: "user-x"},
		{Path: "/settings", Label: "Settings", Key: "settings", Icon: "settings"},
		{Path: "/about", Label: "About", Key: "about", Icon: "info"},
	}
}

// NewPageData creates a new PageData with defaults
func NewPageData(page, title string) *PageData {
	navItems := DefaultNavItems()

	// Mark active nav item
	for i := range navItems {
		if navItems[i].Path == "/"+page || (page == "radar" && navItems[i].Path == "/") {
			navItems[i].Active = true
		}
	}

	return &PageData{
		Page:     page,
		Title:    title,
		Active:   page,
		NavItems: navItems,
	}
}

// WithVersion sets the version and returns the PageData for chaining
func (p *PageData) WithVersion(version string) *PageData {
	p.Version = version
	return p
}

// WithData sets the page-specific data and returns the PageData for chaining
func (p *PageData) WithData(data interface{}) *PageData {
	p.Data = data
	return p
}

// CheckboxData represents data for a checkbox partial
type CheckboxData struct {
	ID       string // Input ID and setting key
	Label    string // Display label
	Tooltip  string // Optional tooltip text
	Checked  bool   // Initial checked state
	Disabled bool   // Whether the checkbox is disabled
	Class    string // Additional CSS classes
}

// CardData represents data for a card partial
type CardData struct {
	Title   string      // Card title
	Class   string      // Additional CSS classes
	Content interface{} // Card content (can be template.HTML or nested template)
}

// InputData represents data for an input partial
type InputData struct {
	ID          string // Input ID and setting key
	Label       string // Display label
	Type        string // Input type (text, number, etc.)
	Placeholder string // Placeholder text
	Value       string // Initial value
	Min         string // Min value for number inputs
	Max         string // Max value for number inputs
	Step        string // Step value for number inputs
	Tooltip     string // Optional tooltip text
	Class       string // Additional CSS classes
	Small       bool   // Use small variant
}

// ResourceGridData represents data for resource tier/enchant grid
type ResourceGridData struct {
	ResourceType string // Resource type (logs, rock, fiber, hide, ore)
	Tiers        []int  // Available tiers (e.g., [4, 5, 6, 7, 8])
	Enchants     []int  // Available enchants (e.g., [0, 1, 2, 3, 4])
	SettingKey   string // Base setting key prefix
}

// SettingsSectionData represents a grouped settings section
type SettingsSectionData struct {
	Title      string         // Section title
	Checkboxes []CheckboxData // Checkboxes in this section
	Inputs     []InputData    // Input fields in this section
}
