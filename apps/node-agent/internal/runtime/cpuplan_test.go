package runtime

import "testing"

func TestCPUBurstCores(t *testing.T) {
	cases := []struct {
		name       string
		sold, host float64
		want       float64
	}{
		{"doubles the plan", 2, 16, 4},
		{"fractional plans", 0.5, 16, 1},
		{"capped at the host", 3, 4, 4},
		{"plan bigger than host", 32, 16, 16},
		{"zero means uncapped", 0, 16, 0},
		{"negative means uncapped", -1, 16, 0},
		{"unknown host cores leaves burst", 2, 0, 4},
	}
	for _, c := range cases {
		if got := cpuBurstCores(c.sold, c.host); got != c.want {
			t.Errorf("%s: cpuBurstCores(%v, %v) = %v, want %v", c.name, c.sold, c.host, got, c.want)
		}
	}
}

func TestDockerCPUShares(t *testing.T) {
	cases := []struct {
		sold float64
		want int64
	}{
		{1, 1024},
		{2, 2048},
		{0.5, 512},
		{0, 0},           // unset — daemon default
		{-1, 0},          // unset
		{0.001, 2},       // clamped to Docker's floor
		{100000, 262144}, // clamped to Docker's ceiling
	}
	for _, c := range cases {
		if got := dockerCPUShares(c.sold); got != c.want {
			t.Errorf("dockerCPUShares(%v) = %d, want %d", c.sold, got, c.want)
		}
	}
}

func TestCgroupCPUWeight(t *testing.T) {
	cases := []struct {
		sold float64
		want int
	}{
		{1, 100}, // one core = the cgroup default weight
		{4, 400},
		{0.5, 50},
		{0, 100},   // unlimited plans keep the default weight
		{0.001, 1}, // clamped to the kernel floor
		{200, 10000},
	}
	for _, c := range cases {
		if got := cgroupCPUWeight(c.sold); got != c.want {
			t.Errorf("cgroupCPUWeight(%v) = %d, want %d", c.sold, got, c.want)
		}
	}
}
