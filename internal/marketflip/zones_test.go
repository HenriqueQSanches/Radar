package marketflip

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func testZoneFS() fstest.MapFS {
	return fstest.MapFS{
		"zones.json": &fstest.MapFile{Data: []byte(`{
			"1000": {"name": "Lymhurst", "type": "PLAYERCITY_SAFEAREA_02", "pvpType": "safe"},
			"3005": {"name": "Caerleon", "type": "PLAYERCITY_SAFEAREA_01", "pvpType": "yellow"}
		}`)},
	}
}

func TestLoadZoneIndex_CityName(t *testing.T) {
	zones, err := LoadZoneIndex(testZoneFS())
	require.NoError(t, err)

	require.Equal(t, "Lymhurst", zones.CityName(1000))
	require.Equal(t, "Caerleon", zones.CityName(3005))
	require.Equal(t, "", zones.CityName(999999))
}

func TestLoadZoneIndex_MissingFile(t *testing.T) {
	_, err := LoadZoneIndex(fstest.MapFS{})
	require.Error(t, err)
}

func TestZoneIndex_NilReceiver(t *testing.T) {
	var zones *ZoneIndex
	require.Equal(t, "", zones.CityName(1000))
}
