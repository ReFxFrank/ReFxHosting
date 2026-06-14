# ReFx Hosting node-agent — build & cross-compile.

BINARY      := refx-agent
PKG         := ./cmd/refx-agent
DIST        := dist
VERSION     ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS     := -s -w -X main.version=$(VERSION)
GOFLAGS     := -trimpath

# Cross-compile target matrix.
PLATFORMS := linux/amd64 linux/arm64 windows/amd64

.PHONY: all build run test vet fmt tidy clean release $(PLATFORMS)

all: build

## build: compile for the host platform into ./$(BINARY)
build:
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BINARY) $(PKG)

## run: build and run with the example config
run: build
	./$(BINARY) --config config.example.yaml

## test: run unit tests
test:
	go test ./...

## vet: static analysis
vet:
	go vet ./...

## fmt: format all Go sources
fmt:
	gofmt -w .

## tidy: sync go.mod/go.sum
tidy:
	go mod tidy

## release: cross-compile every platform into ./$(DIST)
release: $(PLATFORMS)

# Pattern rule: build one GOOS/GOARCH target.
$(PLATFORMS):
	$(eval GOOS := $(word 1,$(subst /, ,$@)))
	$(eval GOARCH := $(word 2,$(subst /, ,$@)))
	$(eval EXT := $(if $(filter windows,$(GOOS)),.exe,))
	@echo ">> building $(GOOS)/$(GOARCH)"
	@mkdir -p $(DIST)
	CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) \
		go build $(GOFLAGS) -ldflags "$(LDFLAGS)" \
		-o $(DIST)/$(BINARY)-$(GOOS)-$(GOARCH)$(EXT) $(PKG)

## clean: remove build artifacts
clean:
	rm -rf $(DIST) $(BINARY) $(BINARY).exe
