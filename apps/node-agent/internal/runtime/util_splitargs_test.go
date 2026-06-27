package runtime

import (
	"reflect"
	"testing"
)

func TestSplitArgs(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{`./srv -port 27015 +map ctf_2fort`, []string{"./srv", "-port", "27015", "+map", "ctf_2fort"}},
		// Quoted arg with spaces survives as one token (the bug strings.Fields had).
		{`-servername="My Cool Server" -players=16`, []string{"-servername=My Cool Server", "-players=16"}},
		{`+server.hostname "A ReFx Server" +rcon.password ""`, []string{"+server.hostname", "A ReFx Server", "+rcon.password", ""}},
		{`-name='single quoted value'`, []string{"-name=single quoted value"}},
		{`bash refx-run.sh`, []string{"bash", "refx-run.sh"}},
		{`  extra   spaces   ok  `, []string{"extra", "spaces", "ok"}},
		{`-x="a\"b"`, []string{`-x=a"b`}},
		{``, nil},
	}
	for _, c := range cases {
		got := splitArgs(c.in)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("splitArgs(%q) = %#v, want %#v", c.in, got, c.want)
		}
	}
}
