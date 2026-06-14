# ReFx Hosting node-agent — multi-stage build producing a tiny static image.
#
# The agent talks to the host Docker engine via the mounted socket, so it runs
# best with /var/run/docker.sock bind-mounted. For native-process hosting it
# needs host PID/cgroup access (run with --privileged or appropriate caps).

# --- build stage -----------------------------------------------------------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Cache dependencies first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=docker
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/refx-agent ./cmd/refx-agent

# --- runtime stage ---------------------------------------------------------
FROM alpine:3.20

# ca-certificates for outbound TLS to the panel/S3; tzdata for log timestamps.
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S refx && adduser -S -G refx refx

COPY --from=build /out/refx-agent /usr/local/bin/refx-agent
COPY config.example.yaml /etc/refx-agent/config.yaml

ENV REFX_CONFIG=/etc/refx-agent/config.yaml
VOLUME ["/var/lib/refx-agent"]

# Control API + SFTP.
EXPOSE 8443 2022

ENTRYPOINT ["/usr/local/bin/refx-agent"]
